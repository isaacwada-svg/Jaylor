-- PR H: fittings linked to orders.
--
-- Before writing this, inspected the existing consultations/consultation_requests
-- tables and the /book/$handle page (see PR description for what was found: no
-- real slot-based availability or booking-token system existed to reuse, only a
-- free-text "preferred time" request that staff manually confirm). This adds a
-- minimal real availability model (weekly hours + closed days, confirmed with
-- the user before building) plus order-linked fitting booking on top of the
-- existing consultations table. Safe to run more than once.

BEGIN;

-- 1. Store fitting hours (new -- no such settings existed before). Sensible
--    Nigerian-retail defaults; owner/manager can change them in Settings.
--    Weekday numbers match JS Date.getDay() (0 = Sunday .. 6 = Saturday),
--    the same convention already used for payroll's Lagos week math.
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS fitting_hours_start time NOT NULL DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS fitting_hours_end time NOT NULL DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS fitting_slot_minutes integer NOT NULL DEFAULT 30 CHECK (fitting_slot_minutes > 0),
  ADD COLUMN IF NOT EXISTS fitting_closed_weekdays integer[] NOT NULL DEFAULT '{0}';

-- One-off closures (public holidays, a day off) on top of the weekly pattern.
CREATE TABLE IF NOT EXISTS public.store_closed_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id),
  closed_date date NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_closed_dates_store_date_unique UNIQUE (store_id, closed_date)
);
ALTER TABLE public.store_closed_dates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_closed_dates_member_select ON public.store_closed_dates;
CREATE POLICY store_closed_dates_member_select ON public.store_closed_dates FOR SELECT TO authenticated
  USING (public.is_store_member(store_id));
DROP POLICY IF EXISTS store_closed_dates_owner_manager_write ON public.store_closed_dates;
CREATE POLICY store_closed_dates_owner_manager_write ON public.store_closed_dates FOR INSERT TO authenticated
  WITH CHECK (public.has_store_role(store_id, ARRAY['owner'::store_role, 'manager'::store_role]));
DROP POLICY IF EXISTS store_closed_dates_owner_manager_delete ON public.store_closed_dates;
CREATE POLICY store_closed_dates_owner_manager_delete ON public.store_closed_dates FOR DELETE TO authenticated
  USING (public.has_store_role(store_id, ARRAY['owner'::store_role, 'manager'::store_role]));

-- 2. consultations -- link to an order, and a purpose distinct from the
--    existing `type` column (type is the pre-existing free-form kind picked
--    in ConsultationForm/book.$handle; purpose is the new order-relevant
--    classification). Every existing row defaults to 'consultation' and is
--    otherwise untouched -- the old free-form booking paths never set
--    order_id or purpose, so they keep working exactly as before.
ALTER TABLE public.consultations
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'consultation'
    CHECK (purpose IN ('consultation', 'fitting', 'final_fitting', 'pickup'));

CREATE INDEX IF NOT EXISTS idx_consultations_order_id ON public.consultations (order_id);
CREATE INDEX IF NOT EXISTS idx_consultations_store_starts_at ON public.consultations (store_id, starts_at);

-- The actual double-booking guarantee: two non-cancelled, order-linked
-- fittings can never share an exact start time at the same store. Scoped to
-- order_id IS NOT NULL (this PR's new flow only) so it can never fail to
-- create against pre-existing rows from the old free-form booking paths.
CREATE UNIQUE INDEX IF NOT EXISTS consultations_store_slot_unique
  ON public.consultations (store_id, starts_at)
  WHERE status <> 'cancelled' AND order_id IS NOT NULL;

-- 3. Fitting links. No booking-token mechanism existed to extend, so this is
--    new, following the same posture as order_approvals/fitting-adjacent
--    tokens: no direct client access, only SECURITY DEFINER functions below
--    read or write it by token.
CREATE TABLE IF NOT EXISTS public.fitting_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  purpose text NOT NULL DEFAULT 'fitting' CHECK (purpose IN ('fitting', 'final_fitting')),
  consultation_id uuid REFERENCES public.consultations(id) ON DELETE SET NULL,
  reschedule_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fitting_links ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies at all -- not even owner/manager SELECT. The
-- token itself is the credential; every read or write goes through a
-- SECURITY DEFINER function below.

-- 4. Private helpers (no grants -- reachable only from the SECURITY DEFINER
--    functions below, same pattern as PR C/D/F/G's private helpers).

-- A boolean-only, auth-free variant of feature_usage()'s plan resolution.
-- feature_usage() itself requires auth.uid() (it raises when the caller
-- isn't a signed-in store member), which breaks for the anonymous /f/$token
-- functions below -- an anonymous client visitor never has a session. This
-- reproduces just the plan/trial lookup, safe to expose to anon callers
-- since it only ever returns a boolean, never store data.
CREATE OR REPLACE FUNCTION public._store_has_feature(p_store_id uuid, p_feature text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_code text;
  v_trial_ends timestamptz;
  v_limit jsonb;
BEGIN
  SELECT trial_ends_at, plan_code INTO v_trial_ends, v_plan_code
  FROM public.stores WHERE id = p_store_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF v_trial_ends IS NOT NULL AND v_trial_ends > now() THEN
    v_plan_code := 'growth';
  END IF;

  SELECT limits -> p_feature INTO v_limit FROM public.plans WHERE code = v_plan_code;
  IF v_limit IS NULL THEN
    RETURN true;
  ELSIF jsonb_typeof(v_limit) = 'boolean' THEN
    RETURN (v_limit #>> '{}')::boolean;
  ELSE
    RETURN true;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._store_has_feature(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._require_consultations_feature(p_store_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public._store_has_feature(p_store_id, 'consultations') THEN
    RAISE EXCEPTION 'Fittings require the Growth plan' USING ERRCODE = 'P0127';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._require_consultations_feature(uuid) FROM PUBLIC, anon, authenticated;

-- Owner/manager always; a tailor only for an order currently assigned to them.
CREATE OR REPLACE FUNCTION public._can_manage_order_fitting(p_store_id uuid, p_assigned_to uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.has_store_role(p_store_id, ARRAY['owner'::store_role, 'manager'::store_role])
    OR (p_assigned_to IS NOT NULL AND p_assigned_to = auth.uid() AND public.is_store_member(p_store_id));
END;
$$;
REVOKE EXECUTE ON FUNCTION public._can_manage_order_fitting(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Computes every open slot over the next p_days days: within business hours,
-- not a closed weekday or one-off closed date, not in the past, and not
-- overlapping any non-cancelled consultation at that store. Africa/Lagos
-- throughout -- "today" and each candidate slot are resolved in that zone.
CREATE OR REPLACE FUNCTION public._compute_fitting_slots(p_store_id uuid, p_days integer DEFAULT 14)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hours_start time;
  v_hours_end time;
  v_slot_minutes integer;
  v_closed_weekdays integer[];
  v_slots jsonb := '[]'::jsonb;
  v_day date;
  v_dow integer;
  v_span_minutes integer;
  v_offset integer;
  v_candidate timestamptz;
BEGIN
  SELECT s.fitting_hours_start, s.fitting_hours_end, s.fitting_slot_minutes, s.fitting_closed_weekdays
  INTO v_hours_start, v_hours_end, v_slot_minutes, v_closed_weekdays
  FROM public.store_settings s WHERE s.store_id = p_store_id;

  IF NOT FOUND THEN
    v_hours_start := '09:00'::time;
    v_hours_end := '18:00'::time;
    v_slot_minutes := 30;
    v_closed_weekdays := ARRAY[0];
  END IF;

  v_span_minutes := extract(epoch FROM (v_hours_end - v_hours_start))::integer / 60;

  FOR d IN 0 .. greatest(p_days, 0) - 1 LOOP
    v_day := (now() AT TIME ZONE 'Africa/Lagos')::date + d;
    v_dow := extract(dow FROM v_day)::integer;
    CONTINUE WHEN v_dow = ANY(v_closed_weekdays);
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.store_closed_dates
      WHERE store_id = p_store_id AND closed_date = v_day
    );

    FOR v_offset IN 0 .. (v_span_minutes - v_slot_minutes) BY v_slot_minutes LOOP
      v_candidate := (v_day + v_hours_start + (v_offset || ' minutes')::interval) AT TIME ZONE 'Africa/Lagos';
      CONTINUE WHEN v_candidate <= now();
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM public.consultations c
        WHERE c.store_id = p_store_id
          AND c.status <> 'cancelled'
          AND c.starts_at < v_candidate + (v_slot_minutes || ' minutes')::interval
          AND c.ends_at > v_candidate
      );
      v_slots := v_slots || jsonb_build_array(to_jsonb(v_candidate));
    END LOOP;
  END LOOP;

  RETURN v_slots;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._compute_fitting_slots(uuid, integer) FROM PUBLIC, anon, authenticated;

-- Re-validated at booking/reschedule time (not just trusted from what the
-- client showed), so a slot taken between page-load and submit is caught
-- with a clear message rather than only relying on the unique index below.
CREATE OR REPLACE FUNCTION public._is_fitting_slot_available(p_store_id uuid, p_starts_at timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(public._compute_fitting_slots(p_store_id, 14)) AS slot
    WHERE slot::timestamptz = p_starts_at
  );
$$;
REVOKE EXECUTE ON FUNCTION public._is_fitting_slot_available(uuid, timestamptz) FROM PUBLIC, anon, authenticated;

-- 5. Staff-facing: read the store's available slots (for the "Book fitting"
--    picker).
CREATE OR REPLACE FUNCTION public.get_store_fitting_availability(p_store_id uuid, p_days integer DEFAULT 14)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_store_member(p_store_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  RETURN public._compute_fitting_slots(p_store_id, p_days);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_store_fitting_availability(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_store_fitting_availability(uuid, integer) TO authenticated;

-- 6. Staff-facing: book directly (owner/manager any order, tailor only if
--    assigned to them).
CREATE OR REPLACE FUNCTION public.book_fitting(
  p_order_id uuid, p_starts_at timestamptz, p_purpose text DEFAULT 'fitting', p_notes text DEFAULT NULL
)
RETURNS public.consultations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_slot_minutes integer;
  v_row public.consultations%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0102';
  END IF;
  IF NOT public._can_manage_order_fitting(v_order.store_id, v_order.assigned_to) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_purpose NOT IN ('consultation', 'fitting', 'final_fitting', 'pickup') THEN
    RAISE EXCEPTION 'Invalid purpose' USING ERRCODE = '22023';
  END IF;
  PERFORM public._require_consultations_feature(v_order.store_id);
  IF NOT public._is_fitting_slot_available(v_order.store_id, p_starts_at) THEN
    RAISE EXCEPTION 'That time is not available' USING ERRCODE = 'P0122';
  END IF;

  SELECT coalesce(fitting_slot_minutes, 30) INTO v_slot_minutes
  FROM public.store_settings WHERE store_id = v_order.store_id;
  v_slot_minutes := coalesce(v_slot_minutes, 30);

  BEGIN
    INSERT INTO public.consultations
      (store_id, client_id, order_id, purpose, type, staff_id, starts_at, ends_at, notes, source, status)
    VALUES (
      v_order.store_id, v_order.client_id, p_order_id, p_purpose, 'fitting',
      auth.uid(), p_starts_at, p_starts_at + (v_slot_minutes || ' minutes')::interval,
      nullif(trim(coalesce(p_notes, '')), ''), 'staff', 'confirmed'
    )
    RETURNING * INTO v_row;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'That time was just taken. Please pick another.' USING ERRCODE = 'P0121';
  END;

  RETURN v_row;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.book_fitting(uuid, timestamptz, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.book_fitting(uuid, timestamptz, text, text) TO authenticated;

-- 7. Staff-facing: reschedule an order fitting (same access rule as booking).
CREATE OR REPLACE FUNCTION public.reschedule_fitting(p_consultation_id uuid, p_new_starts_at timestamptz)
RETURNS public.consultations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_consultation public.consultations%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_slot_minutes integer;
BEGIN
  SELECT * INTO v_consultation FROM public.consultations WHERE id = p_consultation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fitting not found' USING ERRCODE = 'P0102';
  END IF;
  IF v_consultation.order_id IS NULL THEN
    RAISE EXCEPTION 'This is not an order fitting' USING ERRCODE = 'P0126';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_consultation.order_id;
  IF NOT public._can_manage_order_fitting(v_consultation.store_id, v_order.assigned_to) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF NOT public._is_fitting_slot_available(v_consultation.store_id, p_new_starts_at) THEN
    RAISE EXCEPTION 'That time is not available' USING ERRCODE = 'P0122';
  END IF;

  SELECT coalesce(fitting_slot_minutes, 30) INTO v_slot_minutes
  FROM public.store_settings WHERE store_id = v_consultation.store_id;
  v_slot_minutes := coalesce(v_slot_minutes, 30);

  BEGIN
    UPDATE public.consultations
    SET starts_at = p_new_starts_at, ends_at = p_new_starts_at + (v_slot_minutes || ' minutes')::interval
    WHERE id = p_consultation_id
    RETURNING * INTO v_consultation;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'That time was just taken. Please pick another.' USING ERRCODE = 'P0121';
  END;

  RETURN v_consultation;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.reschedule_fitting(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reschedule_fitting(uuid, timestamptz) TO authenticated;

-- 8. Staff-facing: cancel. Owner/manager only (not listed for tailor in the
--    spec, unlike book/reschedule).
CREATE OR REPLACE FUNCTION public.cancel_fitting(p_consultation_id uuid)
RETURNS public.consultations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_consultation public.consultations%ROWTYPE;
BEGIN
  SELECT * INTO v_consultation FROM public.consultations WHERE id = p_consultation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fitting not found' USING ERRCODE = 'P0102';
  END IF;
  IF NOT public.has_store_role(v_consultation.store_id, ARRAY['owner'::store_role, 'manager'::store_role]) THEN
    RAISE EXCEPTION 'Only the owner or a manager can cancel a fitting' USING ERRCODE = 'P0108';
  END IF;

  UPDATE public.consultations SET status = 'cancelled' WHERE id = p_consultation_id
  RETURNING * INTO v_consultation;

  RETURN v_consultation;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.cancel_fitting(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_fitting(uuid) TO authenticated;

-- 9. Staff-facing: create a booking link to send to the client.
CREATE OR REPLACE FUNCTION public.create_fitting_link(p_order_id uuid, p_purpose text DEFAULT 'fitting')
RETURNS public.fitting_links
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_row public.fitting_links%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0102';
  END IF;
  IF NOT public._can_manage_order_fitting(v_order.store_id, v_order.assigned_to) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF v_order.status IN ('collected', 'cancelled') THEN
    RAISE EXCEPTION 'This order is no longer open for fittings' USING ERRCODE = 'P0116';
  END IF;
  IF p_purpose NOT IN ('fitting', 'final_fitting') THEN
    RAISE EXCEPTION 'Invalid purpose' USING ERRCODE = '22023';
  END IF;
  PERFORM public._require_consultations_feature(v_order.store_id);

  INSERT INTO public.fitting_links (store_id, order_id, purpose, created_by)
  VALUES (v_order.store_id, p_order_id, p_purpose, auth.uid())
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_fitting_link(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_fitting_link(uuid, text) TO authenticated;

-- 10. Public (/f/$token): what to show. Never an error for an
--     expired/used/closed-order link -- a status field the client renders
--     its own friendly message (with the shop's WhatsApp button) from.
CREATE OR REPLACE FUNCTION public.get_fitting_link_details(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link public.fitting_links%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_store record;
  v_consultation public.consultations%ROWTYPE;
  v_can_reschedule boolean;
BEGIN
  SELECT * INTO v_link FROM public.fitting_links WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  SELECT name, whatsapp_phone INTO v_store FROM public.stores WHERE id = v_link.store_id;
  SELECT * INTO v_order FROM public.orders WHERE id = v_link.order_id;

  IF v_order.status IN ('collected', 'cancelled') THEN
    RETURN jsonb_build_object('status', 'order_closed', 'store_name', v_store.name, 'store_whatsapp', v_store.whatsapp_phone);
  END IF;
  IF v_link.expires_at < now() THEN
    RETURN jsonb_build_object('status', 'expired', 'store_name', v_store.name, 'store_whatsapp', v_store.whatsapp_phone);
  END IF;

  IF v_link.used_at IS NOT NULL THEN
    SELECT * INTO v_consultation FROM public.consultations WHERE id = v_link.consultation_id;
    IF FOUND AND v_consultation.status <> 'cancelled' THEN
      v_can_reschedule := v_link.reschedule_count < 1 AND v_consultation.starts_at > now() + interval '12 hours';
      RETURN jsonb_build_object(
        'status', CASE WHEN v_can_reschedule THEN 'booked_reschedulable' ELSE 'used' END,
        'store_name', v_store.name,
        'store_whatsapp', v_store.whatsapp_phone,
        'garment_type', v_order.garment_type,
        'purpose', v_link.purpose,
        'starts_at', v_consultation.starts_at,
        'available_slots', CASE WHEN v_can_reschedule THEN public._compute_fitting_slots(v_link.store_id, 14) ELSE '[]'::jsonb END
      );
    END IF;
    -- The earlier booking was cancelled by staff -- let the same link be
    -- used to book fresh rather than stranding the client on "used".
  END IF;

  RETURN jsonb_build_object(
    'status', 'available',
    'store_name', v_store.name,
    'store_whatsapp', v_store.whatsapp_phone,
    'garment_type', v_order.garment_type,
    'quantity', v_order.quantity,
    'purpose', v_link.purpose,
    'available_slots', public._compute_fitting_slots(v_link.store_id, 14)
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_fitting_link_details(uuid) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.get_fitting_link_details(uuid) TO anon, authenticated;

-- 11. Public (/f/$token): book a slot.
CREATE OR REPLACE FUNCTION public.book_fitting_via_link(p_token uuid, p_starts_at timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link public.fitting_links%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_slot_minutes integer;
  v_consultation public.consultations%ROWTYPE;
BEGIN
  SELECT * INTO v_link FROM public.fitting_links WHERE token = p_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This booking link is no longer valid' USING ERRCODE = 'P0117';
  END IF;
  IF v_link.expires_at < now() THEN
    RAISE EXCEPTION 'This booking link has expired' USING ERRCODE = 'P0118';
  END IF;
  IF v_link.used_at IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.consultations WHERE id = v_link.consultation_id AND status = 'cancelled'
  ) THEN
    RAISE EXCEPTION 'This booking link has already been used' USING ERRCODE = 'P0119';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_link.order_id;
  IF v_order.status IN ('collected', 'cancelled') THEN
    RAISE EXCEPTION 'This order is no longer open for fittings' USING ERRCODE = 'P0116';
  END IF;
  PERFORM public._require_consultations_feature(v_link.store_id);
  IF NOT public._is_fitting_slot_available(v_link.store_id, p_starts_at) THEN
    RAISE EXCEPTION 'That time is not available' USING ERRCODE = 'P0122';
  END IF;

  SELECT coalesce(fitting_slot_minutes, 30) INTO v_slot_minutes
  FROM public.store_settings WHERE store_id = v_link.store_id;
  v_slot_minutes := coalesce(v_slot_minutes, 30);

  BEGIN
    INSERT INTO public.consultations
      (store_id, client_id, order_id, purpose, type, starts_at, ends_at, source, status)
    VALUES (
      v_link.store_id, v_order.client_id, v_link.order_id, v_link.purpose, 'fitting',
      p_starts_at, p_starts_at + (v_slot_minutes || ' minutes')::interval, 'public', 'confirmed'
    )
    RETURNING * INTO v_consultation;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'That time was just taken. Please pick another.' USING ERRCODE = 'P0121';
  END;

  UPDATE public.fitting_links SET used_at = now(), consultation_id = v_consultation.id WHERE id = v_link.id;

  RETURN jsonb_build_object('starts_at', v_consultation.starts_at, 'purpose', v_consultation.purpose);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.book_fitting_via_link(uuid, timestamptz) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.book_fitting_via_link(uuid, timestamptz) TO anon, authenticated;

-- 12. Public (/f/$token): reschedule once, until 12 hours before the slot.
CREATE OR REPLACE FUNCTION public.reschedule_fitting_via_link(p_token uuid, p_new_starts_at timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link public.fitting_links%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_consultation public.consultations%ROWTYPE;
  v_slot_minutes integer;
BEGIN
  SELECT * INTO v_link FROM public.fitting_links WHERE token = p_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This booking link is no longer valid' USING ERRCODE = 'P0117';
  END IF;
  IF v_link.expires_at < now() THEN
    RAISE EXCEPTION 'This booking link has expired' USING ERRCODE = 'P0118';
  END IF;
  IF v_link.consultation_id IS NULL THEN
    RAISE EXCEPTION 'No booking to reschedule yet' USING ERRCODE = 'P0123';
  END IF;

  SELECT * INTO v_consultation FROM public.consultations WHERE id = v_link.consultation_id;
  IF NOT FOUND OR v_consultation.status = 'cancelled' THEN
    RAISE EXCEPTION 'No booking to reschedule yet' USING ERRCODE = 'P0123';
  END IF;
  IF v_link.reschedule_count >= 1 THEN
    RAISE EXCEPTION 'This link has already been used to reschedule once' USING ERRCODE = 'P0124';
  END IF;
  IF v_consultation.starts_at <= now() + interval '12 hours' THEN
    RAISE EXCEPTION 'Too close to the appointment to reschedule online' USING ERRCODE = 'P0125';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_link.order_id;
  IF v_order.status IN ('collected', 'cancelled') THEN
    RAISE EXCEPTION 'This order is no longer open for fittings' USING ERRCODE = 'P0116';
  END IF;
  IF NOT public._is_fitting_slot_available(v_link.store_id, p_new_starts_at) THEN
    RAISE EXCEPTION 'That time is not available' USING ERRCODE = 'P0122';
  END IF;

  SELECT coalesce(fitting_slot_minutes, 30) INTO v_slot_minutes
  FROM public.store_settings WHERE store_id = v_link.store_id;
  v_slot_minutes := coalesce(v_slot_minutes, 30);

  BEGIN
    UPDATE public.consultations
    SET starts_at = p_new_starts_at, ends_at = p_new_starts_at + (v_slot_minutes || ' minutes')::interval
    WHERE id = v_consultation.id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'That time was just taken. Please pick another.' USING ERRCODE = 'P0121';
  END;

  UPDATE public.fitting_links SET reschedule_count = reschedule_count + 1 WHERE id = v_link.id;

  RETURN jsonb_build_object('starts_at', p_new_starts_at);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.reschedule_fitting_via_link(uuid, timestamptz) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_fitting_via_link(uuid, timestamptz) TO anon, authenticated;

-- 13. get_order_tracking() -- reproduced from its tracked definition
--     (20260930090000), every existing field unchanged, with next_fitting
--     added: the soonest upcoming, non-cancelled fitting for this order, or
--     null. No notes or staff names, per spec.
CREATE OR REPLACE FUNCTION public.get_order_tracking(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_store record;
  v_balance record;
  v_dedicated record;
  v_jaylor_pay boolean;
  v_timeline jsonb;
  v_next_fitting record;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE tracking_token = p_token;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT name, logo_url INTO v_store FROM public.stores WHERE id = v_order.store_id;

  SELECT paid, balance INTO v_balance
  FROM public.order_balances WHERE order_id = v_order.id;

  SELECT account_number, account_name, bank_name INTO v_dedicated
  FROM public.dedicated_accounts
  WHERE store_id = v_order.store_id AND status = 'active';

  SELECT EXISTS (
    SELECT 1 FROM public.payment_accounts
    WHERE store_id = v_order.store_id AND status = 'active' AND subaccount_code IS NOT NULL
  ) INTO v_jaylor_pay;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'from_status', h.from_status,
    'to_status', h.to_status,
    'changed_at', h.changed_at,
    'note', h.note,
    'photo_url', h.photo_url
  ) ORDER BY h.changed_at ASC), '[]'::jsonb) INTO v_timeline
  FROM public.order_status_history h
  WHERE h.order_id = v_order.id;

  SELECT starts_at, purpose INTO v_next_fitting
  FROM public.consultations
  WHERE order_id = v_order.id AND status <> 'cancelled' AND starts_at > now()
  ORDER BY starts_at ASC
  LIMIT 1;

  RETURN jsonb_build_object(
    'store_name', coalesce(v_store.name, 'Jaylor'),
    'store_logo_url', v_store.logo_url,
    'garment_type', v_order.garment_type,
    'quantity', v_order.quantity,
    'status', v_order.status,
    'delivery_date', v_order.delivery_date,
    'ready_at', v_order.ready_at,
    'paid', coalesce(v_balance.paid, 0),
    'balance', coalesce(v_balance.balance, 0),
    'order_id', v_order.id,
    'timeline', v_timeline,
    'dedicated_account', CASE WHEN v_dedicated.account_number IS NOT NULL THEN
      jsonb_build_object(
        'account_number', v_dedicated.account_number,
        'account_name', v_dedicated.account_name,
        'bank_name', v_dedicated.bank_name
      )
    ELSE NULL END,
    'jaylor_pay_available', coalesce(v_jaylor_pay, false),
    'next_fitting', CASE WHEN v_next_fitting.starts_at IS NOT NULL THEN
      jsonb_build_object('starts_at', v_next_fitting.starts_at, 'purpose', v_next_fitting.purpose)
    ELSE NULL END
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_order_tracking(uuid) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.get_order_tracking(uuid) TO anon, authenticated;

-- 14. Verification -- one row: all_true, and which checks (if any) failed.
SELECT
  bool_and(v) AS all_true,
  coalesce(string_agg(k, ', ') FILTER (WHERE NOT v), 'none') AS failed_checks
FROM (VALUES
  ('store_settings_fitting_hours', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'store_settings' AND column_name = 'fitting_hours_start'
  )),
  ('store_closed_dates_table', to_regclass('public.store_closed_dates') IS NOT NULL),
  ('consultations_order_id', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'consultations' AND column_name = 'order_id'
  )),
  ('consultations_purpose', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'consultations' AND column_name = 'purpose'
  )),
  ('consultations_slot_unique_index', to_regclass('public.consultations_store_slot_unique') IS NOT NULL),
  ('fitting_links_table', to_regclass('public.fitting_links') IS NOT NULL),
  ('fitting_links_rls_enabled', coalesce((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.fitting_links'::regclass), false)),
  ('get_store_fitting_availability_fn', to_regprocedure('public.get_store_fitting_availability(uuid,integer)') IS NOT NULL),
  ('book_fitting_fn', to_regprocedure('public.book_fitting(uuid,timestamptz,text,text)') IS NOT NULL),
  ('reschedule_fitting_fn', to_regprocedure('public.reschedule_fitting(uuid,timestamptz)') IS NOT NULL),
  ('cancel_fitting_fn', to_regprocedure('public.cancel_fitting(uuid)') IS NOT NULL),
  ('create_fitting_link_fn', to_regprocedure('public.create_fitting_link(uuid,text)') IS NOT NULL),
  ('get_fitting_link_details_fn', to_regprocedure('public.get_fitting_link_details(uuid)') IS NOT NULL),
  ('book_fitting_via_link_fn', to_regprocedure('public.book_fitting_via_link(uuid,timestamptz)') IS NOT NULL),
  ('reschedule_fitting_via_link_fn', to_regprocedure('public.reschedule_fitting_via_link(uuid,timestamptz)') IS NOT NULL),
  ('get_order_tracking_fn', to_regprocedure('public.get_order_tracking(uuid)') IS NOT NULL)
) AS checks(k, v);

COMMIT;
