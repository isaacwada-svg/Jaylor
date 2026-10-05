-- Consolidated manual apply: everything Lovable's live-database audit found
-- missing (Lovable does not run migrations pushed from GitHub, so these
-- tracked migration files were written but never actually executed against
-- the live database):
--
--   - 20260923085842: moments, moment_settings, client_fit_feedback,
--     clients.first_order_date, set_client_first_order_date,
--     record_fit_feedback, create_moment, the ready/progress triggers, and
--     the 5 daily moment generator functions.
--   - 20260923094134: get_fitcheck_context (needs client_fit_feedback).
--   - 20260924054209: store_milestones, the milestone triggers,
--     generate_zero_balance_milestones, clients.style_book_token and
--     style_book_revoked, get_style_book, set_style_book_revoked.
--   - 20260925120000: seed_job_templates and the default rows only --
--     job_templates itself, its RLS and its policies already exist live
--     (confirmed), just with 0 rows, so this script does not touch the
--     table/RLS/policies, only the seeding function, its trigger, and a
--     backfill for every store that has no default templates yet.
--   - 20261001080000 (PR P2): order_materials.billed_to_client,
--     set_order_material_billed_to_client, and -- deliberately not skipped
--     -- the P2 versions of use_stock_on_order, _all_order_balances and
--     _compute_health_report. Checked every migration after 20261001080000
--     (through 20261001090000, PR Q0's plan gating, the current tip): none
--     of them touch these three functions again, so the P2 bodies below
--     are already the final merged version -- nothing to merge forward.
--
-- pg_cron and pg_net are now installed live, so both cron blocks below
-- (moments-daily, milestones-daily) run for real this time, guarded the
-- same no-op-if-unavailable way as every other cron block in this project.
--
-- Explicitly NOT touched (already live, working, out of scope): limit
-- triggers, feature_usage, digests, payments, payroll, currencies, plan
-- gating, order/quote/event approvals, usage tracking, order_balances (the
-- view), _store_order_balances -- the last two automatically pick up
-- _all_order_balances' new billed_to_client filter since they read through
-- it, with no changes of their own needed.
--
-- billed_to_client decision (so this script matches the product decision,
-- not Lovable's suggestion to skip it): stock used from inventory
-- (use_stock_on_order) defaults to NOT billed to the client -- it's already
-- part of the agreed price. A manually entered, tailor-purchased material
-- defaults to billed -- fabric bought specifically for this order. Existing
-- rows are backfilled true for every source = 'tailor' row (the only kind
-- order_balances' total ever counted) and false otherwise, so every
-- existing balance and health-report figure stays byte-for-byte identical
-- after this runs.
--
-- Safe to run more than once: every CREATE TABLE is IF NOT EXISTS, every
-- function is OR REPLACE, every trigger and policy is dropped before
-- recreation, every column add is IF NOT EXISTS, every backfill is
-- ON CONFLICT DO NOTHING or scoped with WHERE NOT EXISTS / WHERE ... IS
-- NULL. Wrapped in one transaction -- either all of this applies, or none
-- of it does.
--
-- Run this by hand in the Supabase SQL editor. It is not a tracked
-- migration file (migrations pushed from GitHub are not applied by
-- Lovable), so it will not run on its own.

BEGIN;

-- ============================================================
-- 1. Moments system (20260923085842): data model, per-store settings, the
--    generation engine (real-time triggers + a daily cron for
--    time-delayed/date-driven moments), and the fit-feedback table. Every
--    moment is tap-to-send only -- this only ever stores a pre-written,
--    editable message and a due date; nothing here calls the WhatsApp
--    Business API or any automated-send path.
-- ============================================================

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS first_order_date date;

CREATE OR REPLACE FUNCTION public.set_client_first_order_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status <> 'cancelled' THEN
    UPDATE public.clients
      SET first_order_date = NEW.created_at::date
      WHERE id = NEW.client_id AND first_order_date IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_client_first_order_date() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS set_client_first_order_date_after_insert ON public.orders;
CREATE TRIGGER set_client_first_order_date_after_insert
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_client_first_order_date();

-- ------------------------------------------------------------
-- moments
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.moments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN (
    'birthday', 'anniversary', 'ready', 'progress', 'fitcheck', 'winback', 'festive'
  )),
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'dismissed')),
  message text NOT NULL,
  photo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS moments_store_due_idx ON public.moments (store_id, due_date, status);
CREATE INDEX IF NOT EXISTS moments_client_idx ON public.moments (client_id, created_at DESC);

ALTER TABLE public.moments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS moments_owner_manager_select ON public.moments;
CREATE POLICY moments_owner_manager_select
  ON public.moments FOR SELECT TO authenticated
  USING (has_store_role(store_id, ARRAY['owner'::store_role, 'manager'::store_role]));

-- Owner/manager can mark a moment sent/dismissed and edit its message
-- before sending, but never rewrite type/client/due_date/order_id -- only
-- the generator functions (service-role, via create_moment) create rows.
DROP POLICY IF EXISTS moments_owner_manager_update ON public.moments;
CREATE POLICY moments_owner_manager_update
  ON public.moments FOR UPDATE TO authenticated
  USING (has_store_role(store_id, ARRAY['owner'::store_role, 'manager'::store_role]))
  WITH CHECK (has_store_role(store_id, ARRAY['owner'::store_role, 'manager'::store_role]));

REVOKE ALL ON public.moments FROM PUBLIC, anon;
GRANT SELECT, UPDATE ON public.moments TO authenticated;
GRANT ALL ON public.moments TO service_role;

-- ------------------------------------------------------------
-- moment_settings: per-store on/off switch per moment type
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.moment_settings (
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN (
    'birthday', 'anniversary', 'ready', 'progress', 'fitcheck', 'winback', 'festive'
  )),
  enabled boolean NOT NULL DEFAULT true,
  PRIMARY KEY (store_id, type)
);

ALTER TABLE public.moment_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS moment_settings_owner_manager_select ON public.moment_settings;
CREATE POLICY moment_settings_owner_manager_select
  ON public.moment_settings FOR SELECT TO authenticated
  USING (has_store_role(store_id, ARRAY['owner'::store_role, 'manager'::store_role]));

DROP POLICY IF EXISTS moment_settings_owner_update ON public.moment_settings;
CREATE POLICY moment_settings_owner_update
  ON public.moment_settings FOR UPDATE TO authenticated
  USING (has_store_role(store_id, ARRAY['owner'::store_role]))
  WITH CHECK (has_store_role(store_id, ARRAY['owner'::store_role]));

REVOKE ALL ON public.moment_settings FROM PUBLIC, anon;
GRANT SELECT, UPDATE ON public.moment_settings TO authenticated;
GRANT ALL ON public.moment_settings TO service_role;

CREATE OR REPLACE FUNCTION public.seed_moment_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.moment_settings (store_id, type, enabled)
  SELECT NEW.id, t, (t <> 'progress')
  FROM unnest(ARRAY['birthday','anniversary','ready','progress','fitcheck','winback','festive']) AS t
  ON CONFLICT (store_id, type) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_moment_settings() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS seed_moment_settings_after_store ON public.stores;
CREATE TRIGGER seed_moment_settings_after_store
AFTER INSERT ON public.stores
FOR EACH ROW EXECUTE FUNCTION public.seed_moment_settings();

-- Backfill existing stores.
INSERT INTO public.moment_settings (store_id, type, enabled)
SELECT s.id, t, (t <> 'progress')
FROM public.stores s
CROSS JOIN unnest(ARRAY['birthday','anniversary','ready','progress','fitcheck','winback','festive']) AS t
ON CONFLICT (store_id, type) DO NOTHING;

-- ------------------------------------------------------------
-- client_fit_feedback
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.client_fit_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  area text NOT NULL,
  result text NOT NULL CHECK (result IN ('perfect', 'too_tight', 'too_loose', 'too_short', 'too_long')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_fit_feedback_client_idx ON public.client_fit_feedback (client_id, created_at DESC);

ALTER TABLE public.client_fit_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_fit_feedback_owner_manager_select ON public.client_fit_feedback;
CREATE POLICY client_fit_feedback_owner_manager_select
  ON public.client_fit_feedback FOR SELECT TO authenticated
  USING (has_store_role(store_id, ARRAY['owner'::store_role, 'manager'::store_role]));

REVOKE ALL ON public.client_fit_feedback FROM PUBLIC, anon;
GRANT SELECT ON public.client_fit_feedback TO authenticated;
GRANT ALL ON public.client_fit_feedback TO service_role;

-- Guest-facing RPC: the fit-check moment links to a public page (like the
-- other unguessable-token guest flows) where the client picks a result
-- without ever needing an account. Verifies the order belongs to the
-- client before recording anything.
CREATE OR REPLACE FUNCTION public.record_fit_feedback(
  p_order_id uuid, p_client_id uuid, p_area text, p_result text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
BEGIN
  IF p_result NOT IN ('perfect', 'too_tight', 'too_loose', 'too_short', 'too_long') THEN
    RAISE EXCEPTION 'Invalid result' USING ERRCODE = '22023';
  END IF;
  IF p_area IS NULL OR length(trim(p_area)) = 0 OR length(p_area) > 40 THEN
    RAISE EXCEPTION 'Invalid area' USING ERRCODE = '22023';
  END IF;

  SELECT store_id INTO v_store_id FROM public.orders
    WHERE id = p_order_id AND client_id = p_client_id;
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.client_fit_feedback (store_id, client_id, order_id, area, result)
  VALUES (v_store_id, p_client_id, p_order_id, p_area, p_result);
END;
$$;

REVOKE ALL ON FUNCTION public.record_fit_feedback(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_fit_feedback(uuid, uuid, text, text) TO anon, authenticated;

-- ------------------------------------------------------------
-- Moment creation helper (idempotent: never duplicates a moment for the
-- same client+type in the same calendar year, or the same order+type ever)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_moment(
  p_store_id uuid, p_client_id uuid, p_type text, p_due_date date,
  p_message text, p_order_id uuid DEFAULT NULL, p_photo_url text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_order_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.moments WHERE order_id = p_order_id AND type = p_type
    ) THEN
      RETURN;
    END IF;
  ELSIF EXISTS (
    SELECT 1 FROM public.moments
    WHERE client_id = p_client_id AND type = p_type
      AND date_part('year', due_date) = date_part('year', p_due_date)
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.moments (store_id, client_id, order_id, type, due_date, message, photo_url)
  VALUES (p_store_id, p_client_id, p_order_id, p_type, p_due_date, p_message, p_photo_url);
END;
$$;

REVOKE ALL ON FUNCTION public.create_moment(uuid, uuid, text, date, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_moment(uuid, uuid, text, date, text, uuid, text) TO service_role;

-- ------------------------------------------------------------
-- Real-time triggers: ready, progress
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_order_ready_moment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
  v_client public.clients%ROWTYPE;
BEGIN
  IF NEW.status = 'ready' AND OLD.status IS DISTINCT FROM 'ready' THEN
    SELECT enabled INTO v_enabled FROM public.moment_settings
      WHERE store_id = NEW.store_id AND type = 'ready';
    SELECT * INTO v_client FROM public.clients WHERE id = NEW.client_id;

    IF coalesce(v_enabled, true) AND v_client.consent_whatsapp THEN
      PERFORM public.create_moment(
        NEW.store_id, NEW.client_id, 'ready', current_date,
        format('Hi %s, your %s is ready for collection.',
          split_part(v_client.full_name, ' ', 1), NEW.garment_type),
        NEW.id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_order_ready_moment() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_order_ready_moment_after_update ON public.orders;
CREATE TRIGGER notify_order_ready_moment_after_update
AFTER UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.notify_order_ready_moment();

CREATE OR REPLACE FUNCTION public.notify_order_progress_moment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
  v_client public.clients%ROWTYPE;
BEGIN
  IF NEW.status IN ('cutting', 'sewing') AND OLD.status NOT IN ('cutting', 'sewing') THEN
    SELECT enabled INTO v_enabled FROM public.moment_settings
      WHERE store_id = NEW.store_id AND type = 'progress';
    IF coalesce(v_enabled, false) THEN
      SELECT * INTO v_client FROM public.clients WHERE id = NEW.client_id;
      IF v_client.consent_whatsapp THEN
        PERFORM public.create_moment(
          NEW.store_id, NEW.client_id, 'progress', current_date,
          format('Hi %s, your %s is now in %s. Sharing a quick look at the progress.',
            split_part(v_client.full_name, ' ', 1), NEW.garment_type, NEW.status),
          NEW.id
        );
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_order_progress_moment() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_order_progress_moment_after_update ON public.orders;
CREATE TRIGGER notify_order_progress_moment_after_update
AFTER UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.notify_order_progress_moment();

-- ------------------------------------------------------------
-- Daily generators: fitcheck, birthday, anniversary, winback, festive
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.generate_fitcheck_moments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT o.id AS order_id, o.store_id, o.client_id, o.garment_type, c.full_name, c.consent_whatsapp
    FROM public.orders o
    JOIN public.clients c ON c.id = o.client_id
    JOIN public.moment_settings ms ON ms.store_id = o.store_id AND ms.type = 'fitcheck'
    WHERE o.status = 'collected'
      AND o.collected_at::date = current_date - 2
      AND ms.enabled
      AND c.consent_whatsapp
  LOOP
    PERFORM public.create_moment(
      r.store_id, r.client_id, 'fitcheck', current_date,
      format('Hi %s, how is the fit on your %s? Let me know if anything needs adjusting.',
        split_part(r.full_name, ' ', 1), r.garment_type),
      r.order_id
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_fitcheck_moments() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_fitcheck_moments() TO service_role;

CREATE OR REPLACE FUNCTION public.generate_birthday_moments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_target date;
BEGIN
  FOR r IN
    SELECT c.id AS client_id, c.store_id, c.full_name, c.birthday
    FROM public.clients c
    JOIN public.moment_settings ms ON ms.store_id = c.store_id AND ms.type = 'birthday'
    WHERE c.birthday IS NOT NULL AND ms.enabled AND c.consent_whatsapp
  LOOP
    -- Clamp a Feb 29 birthday to Feb 28 in a non-leap target year rather
    -- than letting make_date raise and abort the whole batch.
    BEGIN
      v_target := make_date(
        extract(year FROM current_date)::int, extract(month FROM r.birthday)::int, extract(day FROM r.birthday)::int
      );
    EXCEPTION WHEN OTHERS THEN
      v_target := make_date(extract(year FROM current_date)::int, 2, 28);
    END;
    IF v_target < current_date THEN
      BEGIN
        v_target := make_date(
          extract(year FROM current_date)::int + 1, extract(month FROM r.birthday)::int, extract(day FROM r.birthday)::int
        );
      EXCEPTION WHEN OTHERS THEN
        v_target := make_date(extract(year FROM current_date)::int + 1, 2, 28);
      END;
    END IF;

    IF v_target = current_date + 5 THEN
      PERFORM public.create_moment(
        r.store_id, r.client_id, 'birthday', current_date,
        format('Happy birthday in advance, %s. If you would like something made for the celebration, let me know this week.',
          split_part(r.full_name, ' ', 1))
      );
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_birthday_moments() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_birthday_moments() TO service_role;

CREATE OR REPLACE FUNCTION public.generate_anniversary_moments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.id AS client_id, c.store_id, c.full_name
    FROM public.clients c
    JOIN public.moment_settings ms ON ms.store_id = c.store_id AND ms.type = 'anniversary'
    WHERE c.birthday IS NULL
      AND c.first_order_date IS NOT NULL
      AND c.first_order_date < current_date
      AND extract(month FROM c.first_order_date) = extract(month FROM current_date)
      AND extract(day FROM c.first_order_date) = extract(day FROM current_date)
      AND ms.enabled
      AND c.consent_whatsapp
  LOOP
    PERFORM public.create_moment(
      r.store_id, r.client_id, 'anniversary', current_date,
      format('One year since your first outfit with us, %s.', split_part(r.full_name, ' ', 1))
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_anniversary_moments() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_anniversary_moments() TO service_role;

CREATE OR REPLACE FUNCTION public.generate_winback_moments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  -- Runs daily but only actually fires on Mondays ("listed weekly").
  IF extract(dow FROM current_date) <> 1 THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT c.id AS client_id, c.store_id, c.full_name, max(o.created_at) AS last_order_at
    FROM public.clients c
    JOIN public.moment_settings ms ON ms.store_id = c.store_id AND ms.type = 'winback'
    LEFT JOIN public.orders o ON o.client_id = c.id AND o.status <> 'cancelled'
    WHERE ms.enabled AND c.consent_whatsapp
    GROUP BY c.id, c.store_id, c.full_name, ms.enabled
    HAVING max(o.created_at) IS NOT NULL AND max(o.created_at) < now() - interval '90 days'
  LOOP
    PERFORM public.create_moment(
      r.store_id, r.client_id, 'winback', current_date,
      format('Hi %s, it has been a while. Let me know if you have anything coming up we can help with.',
        split_part(r.full_name, ' ', 1))
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_winback_moments() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_winback_moments() TO service_role;

CREATE OR REPLACE FUNCTION public.generate_festive_moments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_label text;
  v_event date;
  r record;
BEGIN
  FOREACH v_key IN ARRAY ARRAY['christmas', 'new_year', 'easter', 'eid_al_fitr', 'eid_al_adha']
  LOOP
    SELECT label INTO v_label FROM public.calendar_event_defs WHERE key = v_key;
    SELECT event_date INTO v_event
      FROM public.next_calendar_occurrence(p_key => v_key, p_from_date => current_date)
      LIMIT 1;
    IF v_event IS NULL OR v_event <> current_date + 5 THEN
      CONTINUE;
    END IF;

    FOR r IN
      SELECT c.id AS client_id, c.store_id, c.full_name
      FROM public.clients c
      JOIN public.moment_settings ms ON ms.store_id = c.store_id AND ms.type = 'festive'
      WHERE ms.enabled AND c.consent_whatsapp
    LOOP
      PERFORM public.create_moment(
        r.store_id, r.client_id, 'festive', current_date,
        format('Hi %s, wishing you a wonderful %s. Let me know if you need anything made in time for it.',
          split_part(r.full_name, ' ', 1), v_label)
      );
    END LOOP;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_festive_moments() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_festive_moments() TO service_role;

-- Schedule everything daily, same no-op-if-unavailable guard used
-- elsewhere in this project.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    PERFORM cron.unschedule('moments-daily')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'moments-daily');
    PERFORM cron.schedule(
      'moments-daily',
      '0 6 * * *',
      $cron$
        SELECT public.generate_fitcheck_moments();
        SELECT public.generate_birthday_moments();
        SELECT public.generate_anniversary_moments();
        SELECT public.generate_winback_moments();
        SELECT public.generate_festive_moments();
      $cron$
    );
  END IF;
END;
$$;

-- ============================================================
-- 2. Fit-check guest page support (20260923094134): depends on
--    client_fit_feedback above.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_fitcheck_context(p_order_id uuid, p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_garment_type text;
  v_client_name text;
  v_store_name text;
  v_already boolean;
BEGIN
  SELECT o.garment_type, c.full_name, s.name
    INTO v_garment_type, v_client_name, v_store_name
  FROM public.orders o
  JOIN public.clients c ON c.id = o.client_id
  JOIN public.stores s ON s.id = o.store_id
  WHERE o.id = p_order_id AND o.client_id = p_client_id;

  IF v_garment_type IS NULL THEN
    RAISE EXCEPTION 'Not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.client_fit_feedback
    WHERE order_id = p_order_id AND client_id = p_client_id
  ) INTO v_already;

  RETURN jsonb_build_object(
    'garment_type', v_garment_type,
    'client_first_name', split_part(v_client_name, ' ', 1),
    'store_name', v_store_name,
    'already_submitted', v_already
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_fitcheck_context(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_fitcheck_context(uuid, uuid) TO anon, authenticated;

-- ============================================================
-- 3. Moments Phase 2 (20260924054209): milestone cards + Style Book.
--    Shareable cards (canvas rendering) are built client-side against this
--    data -- nothing here generates images, it only detects achievements
--    and exposes a safe, revocable read of a client's garment history.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.store_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  milestone_key text NOT NULL CHECK (milestone_key IN (
    'orders_50', 'orders_100', 'collected_1m', 'zero_balance_day'
  )),
  achieved_at timestamptz NOT NULL DEFAULT now(),
  detail jsonb,
  acknowledged boolean NOT NULL DEFAULT false,
  UNIQUE (store_id, milestone_key)
);

ALTER TABLE public.store_milestones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_milestones_owner_manager_select ON public.store_milestones;
CREATE POLICY store_milestones_owner_manager_select
  ON public.store_milestones FOR SELECT TO authenticated
  USING (has_store_role(store_id, ARRAY['owner'::store_role, 'manager'::store_role]));

-- Owner/manager can only ever flip acknowledged -- app logic is the only
-- thing that should ever set milestone_key/detail/achieved_at, same
-- pattern as moments_owner_manager_update.
DROP POLICY IF EXISTS store_milestones_owner_manager_ack ON public.store_milestones;
CREATE POLICY store_milestones_owner_manager_ack
  ON public.store_milestones FOR UPDATE TO authenticated
  USING (has_store_role(store_id, ARRAY['owner'::store_role, 'manager'::store_role]))
  WITH CHECK (has_store_role(store_id, ARRAY['owner'::store_role, 'manager'::store_role]));

REVOKE ALL ON public.store_milestones FROM PUBLIC, anon;
GRANT SELECT, UPDATE ON public.store_milestones TO authenticated;
GRANT ALL ON public.store_milestones TO service_role;

-- Order-count milestones: 50th and 100th non-cancelled order.
CREATE OR REPLACE FUNCTION public.check_order_count_milestones()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count bigint;
BEGIN
  IF NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_count FROM public.orders
    WHERE store_id = NEW.store_id AND status <> 'cancelled';

  IF v_count = 50 THEN
    INSERT INTO public.store_milestones (store_id, milestone_key, detail)
    VALUES (NEW.store_id, 'orders_50', jsonb_build_object('order_count', 50))
    ON CONFLICT (store_id, milestone_key) DO NOTHING;
  ELSIF v_count = 100 THEN
    INSERT INTO public.store_milestones (store_id, milestone_key, detail)
    VALUES (NEW.store_id, 'orders_100', jsonb_build_object('order_count', 100))
    ON CONFLICT (store_id, milestone_key) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_order_count_milestones() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS check_order_count_milestones_after_insert ON public.orders;
CREATE TRIGGER check_order_count_milestones_after_insert
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.check_order_count_milestones();

-- Collected-amount milestone: first time cumulative non-voided payments
-- for a store crosses N1,000,000.
CREATE OR REPLACE FUNCTION public.check_collected_amount_milestone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric;
BEGIN
  IF NEW.voided THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(sum(amount), 0) INTO v_total
    FROM public.payments
    WHERE store_id = NEW.store_id AND voided = false;

  IF v_total >= 1000000 THEN
    INSERT INTO public.store_milestones (store_id, milestone_key, detail)
    VALUES (NEW.store_id, 'collected_1m', jsonb_build_object('amount', v_total))
    ON CONFLICT (store_id, milestone_key) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_collected_amount_milestone() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS check_collected_amount_milestone_after_insert ON public.payments;
CREATE TRIGGER check_collected_amount_milestone_after_insert
AFTER INSERT ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.check_collected_amount_milestone();

-- "First month with no unpaid balance": a daily service-role check reading
-- it literally would need month-end evaluation; this instead records the
-- first day a store's total outstanding balance ever hits zero.
CREATE OR REPLACE FUNCTION public.generate_zero_balance_milestones()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT s.id AS store_id
    FROM public.stores s
    WHERE EXISTS (SELECT 1 FROM public.orders o WHERE o.store_id = s.id)
      AND NOT EXISTS (
        SELECT 1 FROM public.store_milestones m
        WHERE m.store_id = s.id AND m.milestone_key = 'zero_balance_day'
      )
      AND coalesce((
        SELECT sum(b.balance) FROM public.order_balances b WHERE b.store_id = s.id
      ), 0) = 0
  LOOP
    INSERT INTO public.store_milestones (store_id, milestone_key, detail)
    VALUES (r.store_id, 'zero_balance_day', jsonb_build_object('date', current_date))
    ON CONFLICT (store_id, milestone_key) DO NOTHING;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_zero_balance_milestones() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_zero_balance_milestones() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    PERFORM cron.unschedule('milestones-daily')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'milestones-daily');
    PERFORM cron.schedule(
      'milestones-daily',
      '0 6 * * *',
      $cron$SELECT public.generate_zero_balance_milestones();$cron$
    );
  END IF;
END;
$$;

-- Style Book: a private, revocable token per client. The link itself is
-- the secret (matches get_invite_by_token / measurement-passport pattern
-- already used elsewhere) -- no login, no price data.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS style_book_token uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS style_book_revoked boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS clients_style_book_token_idx
  ON public.clients (style_book_token);

CREATE OR REPLACE FUNCTION public.get_style_book(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client record;
  v_store record;
  v_garments jsonb;
BEGIN
  SELECT id, full_name, style_book_revoked INTO v_client
  FROM public.clients WHERE style_book_token = p_token;

  IF v_client.id IS NULL THEN
    RAISE EXCEPTION 'Not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_client.style_book_revoked THEN
    RAISE EXCEPTION 'This link has been turned off' USING ERRCODE = 'P0002';
  END IF;

  SELECT s.id, s.name, s.logo_url INTO v_store
  FROM public.stores s
  JOIN public.clients c ON c.store_id = s.id
  WHERE c.id = v_client.id;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'garment_type', o.garment_type,
      'created_at', o.created_at,
      'collected_at', o.collected_at
    ) ORDER BY o.created_at DESC
  ), '[]'::jsonb) INTO v_garments
  FROM public.orders o
  WHERE o.client_id = v_client.id AND o.status <> 'cancelled';

  RETURN jsonb_build_object(
    'client_first_name', split_part(v_client.full_name, ' ', 1),
    'store_name', v_store.name,
    'store_logo_url', v_store.logo_url,
    'garments', v_garments
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_style_book(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_style_book(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_style_book_revoked(p_client_id uuid, p_revoked boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
BEGIN
  SELECT store_id INTO v_store_id FROM public.clients WHERE id = p_client_id;
  IF v_store_id IS NULL OR NOT has_store_role(v_store_id, ARRAY['owner'::store_role, 'manager'::store_role]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.clients
    SET style_book_revoked = p_revoked,
        style_book_token = CASE WHEN p_revoked = false THEN gen_random_uuid() ELSE style_book_token END
    WHERE id = p_client_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_style_book_revoked(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_style_book_revoked(uuid, boolean) TO authenticated;

-- ============================================================
-- 4. Job template seeding (20260925120000, scoped): job_templates itself,
--    its RLS and its policies already exist live with 0 rows -- only the
--    seeding function, its trigger and a backfill are missing. Backfills
--    EVERY store with no default templates yet, not just one, and the
--    trigger covers every store created from now on.
-- ============================================================

CREATE OR REPLACE FUNCTION public.seed_job_templates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.job_templates (
    store_id, job_type, label, description, name_placeholder,
    payer_mode, collection_mode, pricing_mode, turnaround_mode,
    guest_welcome_line, is_contract, is_default, sort_order
  )
  VALUES
    (NEW.id, 'aso_ebi', 'Aso-ebi',
      'A wedding or owambe — each guest measures and pays their own share.',
      'Adeyemi wedding aso-ebi', 'each_pays', 'measurements', 'flat', 'standard',
      'Hi {name}, welcome to the group order.', false, true, 0),
    (NEW.id, 'burial', 'Burial',
      'Short notice, family aso-ebi for a funeral — rush turnaround by default.',
      'Chief Okafor burial aso-ebi', 'each_pays', 'measurements', 'flat', 'rush',
      'Hi {name}, our condolences. Here''s the group order for the burial.', false, true, 1),
    (NEW.id, 'family_occasion', 'Family occasion',
      'Christmas, Sallah, naming or a birthday — one parent usually pays for all.',
      'Family Christmas outfits', 'single_payer', 'measurements', 'flat', 'standard',
      'Hi {name}, please confirm your measurements for this occasion.', false, true, 2),
    (NEW.id, 'association', 'Church or association',
      'Uniforms for a church, mosque or association — members pay their own way.',
      'Women''s fellowship uniform', 'each_pays', 'measurements', 'flat', 'standard',
      'Hi {name}, welcome to the group uniform order.', false, true, 3),
    (NEW.id, 'school_uniform', 'School uniforms',
      'A school''s own uniform contract, sized rather than measured, term after term.',
      'Bright Stars School uniforms — 1st term', 'single_payer', 'sizes', 'quantity_tiers', 'standard',
      'Hi {name}, please confirm your size for the school uniform.', true, true, 4),
    (NEW.id, 'corporate_uniform', 'Company uniforms',
      'Staff uniforms for a company or hotel — a formal quote and invoice.',
      'Lagos Continental Hotel staff uniforms', 'single_payer', 'sizes', 'quantity_tiers', 'standard',
      'Hi {name}, please confirm your size for the staff uniform.', true, true, 5),
    (NEW.id, 'sports_team', 'Team kit',
      'Kit for a sports team or campaign crew, by name and number.',
      'Eagles FC away kit', 'single_payer', 'sizes', 'flat', 'standard',
      'Hi {name}, please confirm your size for the team kit.', false, true, 6),
    (NEW.id, 'diaspora', 'Order from abroad',
      'A client outside Nigeria — self-measure, pay by card, ship to them.',
      'Order for Chidinma — London', 'each_pays', 'measurements', 'flat', 'standard',
      'Hi {name}, welcome — let''s get your measurements for your order abroad.', false, true, 7),
    (NEW.id, 'remote_individual', 'One client, remote',
      'A single client who can''t come in — send one measure-and-pay link.',
      'Order for Blessing', 'each_pays', 'measurements', 'flat', 'standard',
      'Hi {name}, welcome — let''s get your measurements sorted remotely.', false, true, 8),
    (NEW.id, 'ready_to_wear', 'Pre-order a collection',
      'Buyers pick a size and quantity from a small catalogue and pay upfront.',
      'December collection pre-order', 'each_pays', 'sizes', 'flat', 'standard',
      'Hi {name}, welcome — pick your size to pre-order.', false, true, 9)
  ON CONFLICT (store_id, job_type) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_job_templates() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_store_seeded_job_templates ON public.stores;
CREATE TRIGGER on_store_seeded_job_templates
  AFTER INSERT ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.seed_job_templates();

-- Seed every store that has no default templates yet (not just one).
INSERT INTO public.job_templates (
  store_id, job_type, label, description, name_placeholder,
  payer_mode, collection_mode, pricing_mode, turnaround_mode,
  guest_welcome_line, is_contract, is_default, sort_order
)
SELECT s.id, v.job_type, v.label, v.description, v.name_placeholder,
  v.payer_mode, v.collection_mode, v.pricing_mode, v.turnaround_mode,
  v.guest_welcome_line, v.is_contract, true, v.sort_order
FROM public.stores s
CROSS JOIN (VALUES
  ('aso_ebi', 'Aso-ebi',
    'A wedding or owambe — each guest measures and pays their own share.',
    'Adeyemi wedding aso-ebi', 'each_pays', 'measurements', 'flat', 'standard',
    'Hi {name}, welcome to the group order.', false, 0),
  ('burial', 'Burial',
    'Short notice, family aso-ebi for a funeral — rush turnaround by default.',
    'Chief Okafor burial aso-ebi', 'each_pays', 'measurements', 'flat', 'rush',
    'Hi {name}, our condolences. Here''s the group order for the burial.', false, 1),
  ('family_occasion', 'Family occasion',
    'Christmas, Sallah, naming or a birthday — one parent usually pays for all.',
    'Family Christmas outfits', 'single_payer', 'measurements', 'flat', 'standard',
    'Hi {name}, please confirm your measurements for this occasion.', false, 2),
  ('association', 'Church or association',
    'Uniforms for a church, mosque or association — members pay their own way.',
    'Women''s fellowship uniform', 'each_pays', 'measurements', 'flat', 'standard',
    'Hi {name}, welcome to the group uniform order.', false, 3),
  ('school_uniform', 'School uniforms',
    'A school''s own uniform contract, sized rather than measured, term after term.',
    'Bright Stars School uniforms — 1st term', 'single_payer', 'sizes', 'quantity_tiers', 'standard',
    'Hi {name}, please confirm your size for the school uniform.', true, 4),
  ('corporate_uniform', 'Company uniforms',
    'Staff uniforms for a company or hotel — a formal quote and invoice.',
    'Lagos Continental Hotel staff uniforms', 'single_payer', 'sizes', 'quantity_tiers', 'standard',
    'Hi {name}, please confirm your size for the staff uniform.', true, 5),
  ('sports_team', 'Team kit',
    'Kit for a sports team or campaign crew, by name and number.',
    'Eagles FC away kit', 'single_payer', 'sizes', 'flat', 'standard',
    'Hi {name}, please confirm your size for the team kit.', false, 6),
  ('diaspora', 'Order from abroad',
    'A client outside Nigeria — self-measure, pay by card, ship to them.',
    'Order for Chidinma — London', 'each_pays', 'measurements', 'flat', 'standard',
    'Hi {name}, welcome — let''s get your measurements for your order abroad.', false, 7),
  ('remote_individual', 'One client, remote',
    'A single client who can''t come in — send one measure-and-pay link.',
    'Order for Blessing', 'each_pays', 'measurements', 'flat', 'standard',
    'Hi {name}, welcome — let''s get your measurements sorted remotely.', false, 8),
  ('ready_to_wear', 'Pre-order a collection',
    'Buyers pick a size and quantity from a small catalogue and pay upfront.',
    'December collection pre-order', 'each_pays', 'sizes', 'flat', 'standard',
    'Hi {name}, welcome — pick your size to pre-order.', false, 9)
) AS v(job_type, label, description, name_placeholder, payer_mode, collection_mode,
       pricing_mode, turnaround_mode, guest_welcome_line, is_contract, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.job_templates t WHERE t.store_id = s.id AND t.is_default
)
ON CONFLICT (store_id, job_type) DO NOTHING;

-- ============================================================
-- 5. PR P2: order_materials.billed_to_client (20261001080000), merged
--    forward. Checked every migration after this one (through
--    20261001090000, the current tip) for changes to use_stock_on_order,
--    _all_order_balances or _compute_health_report -- none touch any of
--    the three again, so these bodies are already the final version.
--
--    Distinguishes a tailor-purchased material the shop bills the client
--    for (added to their total; pass-through in profit, since it's added
--    to both the client's total and the shop's own cost) from one used as
--    part of the agreed price (a true cost, not billed).
-- ============================================================

-- Column + backfill. Nullable first so the backfill can run, then
-- defaulted and required. Existing rows keep today's balances exactly:
-- true (billed) for every source = 'tailor' row -- the only source
-- order_balances' own total ever added -- false otherwise.
ALTER TABLE public.order_materials ADD COLUMN IF NOT EXISTS billed_to_client boolean;
UPDATE public.order_materials SET billed_to_client = (source = 'tailor') WHERE billed_to_client IS NULL;
ALTER TABLE public.order_materials ALTER COLUMN billed_to_client SET DEFAULT true;
ALTER TABLE public.order_materials ALTER COLUMN billed_to_client SET NOT NULL;

-- use_stock_on_order (PR G): stock used on an order now defaults to NOT
-- billed to the client. Unchanged otherwise.
CREATE OR REPLACE FUNCTION public.use_stock_on_order(
  p_item_id uuid, p_order_id uuid, p_quantity numeric, p_note text DEFAULT NULL
)
RETURNS public.order_materials
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.inventory_items%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_material public.order_materials%ROWTYPE;
  v_cost numeric;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0102';
  END IF;
  IF NOT public.is_store_member(v_order.store_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  PERFORM public._require_inventory_feature(v_order.store_id);

  SELECT * INTO v_item FROM public.inventory_items
  WHERE id = p_item_id AND store_id = v_order.store_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found' USING ERRCODE = 'P0102';
  END IF;
  IF NOT v_item.is_active THEN
    RAISE EXCEPTION 'This item is no longer active' USING ERRCODE = 'P0113';
  END IF;
  IF v_item.quantity < p_quantity THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0114',
      MESSAGE = format('Only %s %s%s of this %s left',
        v_item.quantity, v_item.unit, CASE WHEN v_item.quantity = 1 THEN '' ELSE 's' END, v_item.name);
  END IF;

  v_cost := p_quantity * coalesce(v_item.cost_per_unit, 0);

  UPDATE public.inventory_items
  SET quantity = quantity - p_quantity, updated_at = now()
  WHERE id = p_item_id;

  INSERT INTO public.order_materials
    (store_id, order_id, source, description, colour, yards, cost, cost_per_yard, inventory_item_id, billed_to_client)
  VALUES (
    v_order.store_id, p_order_id, 'tailor', v_item.name, NULL,
    CASE WHEN v_item.unit = 'yard' THEN p_quantity ELSE NULL END,
    v_cost, v_item.cost_per_unit, p_item_id, false
  )
  RETURNING * INTO v_material;

  INSERT INTO public.inventory_movements
    (store_id, item_id, type, quantity, unit_cost, order_id, order_material_id, note, created_by)
  VALUES (
    v_order.store_id, p_item_id, 'used', p_quantity, v_item.cost_per_unit,
    p_order_id, v_material.id, nullif(trim(coalesce(p_note, '')), ''), auth.uid()
  );

  RETURN v_material;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.use_stock_on_order(uuid, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.use_stock_on_order(uuid, uuid, numeric, text) TO authenticated;

-- Owner/manager only, while the order is not yet collected. Only a
-- tailor-purchased material can be billed to the client -- client-
-- supplied fabric was never a cost to begin with.
CREATE OR REPLACE FUNCTION public.set_order_material_billed_to_client(
  p_material_id uuid, p_billed_to_client boolean
)
RETURNS public.order_materials
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_material public.order_materials%ROWTYPE;
  v_order public.orders%ROWTYPE;
BEGIN
  SELECT * INTO v_material FROM public.order_materials WHERE id = p_material_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Material not found' USING ERRCODE = 'P0102';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_material.order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0102';
  END IF;

  IF NOT public.has_store_role(v_order.store_id, ARRAY['owner'::store_role, 'manager'::store_role]) THEN
    RAISE EXCEPTION 'Only the owner or a manager can change billing for a material' USING ERRCODE = 'P0108';
  END IF;

  IF v_material.source <> 'tailor' THEN
    RAISE EXCEPTION 'Only tailor-purchased materials can be billed to the client' USING ERRCODE = 'P0134';
  END IF;

  IF v_order.status = 'collected' THEN
    RAISE EXCEPTION 'This order has already been collected' USING ERRCODE = 'P0135';
  END IF;

  UPDATE public.order_materials
  SET billed_to_client = p_billed_to_client
  WHERE id = p_material_id
  RETURNING * INTO v_material;

  RETURN v_material;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_order_material_billed_to_client(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_order_material_billed_to_client(uuid, boolean) TO authenticated;

-- order_balances: total/balance now add only billed_to_client materials
-- (still currency-converted as PR P already does). billed_to_client is
-- the authoritative flag now -- it subsumes the old source = 'tailor'
-- filter, since a customer-supplied row is always backfilled to false and
-- can never be set to true (enforced above). The public order_balances
-- view and _store_order_balances() both read through this function, so
-- they pick up the new filter automatically -- neither is redefined here.
CREATE OR REPLACE FUNCTION public._all_order_balances()
RETURNS TABLE(order_id uuid, store_id uuid, total numeric, paid numeric, balance numeric, currency text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.id,
    o.store_id,
    o.price + coalesce((
      SELECT sum(
        CASE WHEN o.currency = 'NGN' THEN om.cost
             ELSE round(om.cost / nullif(o.fx_rate_to_ngn, 0), 2) END
      )
      FROM public.order_materials om
      WHERE om.order_id = o.id AND om.billed_to_client = true
    ), 0) AS total,
    coalesce((
      SELECT sum(p.amount) FROM public.payments p
      WHERE p.order_id = o.id AND p.voided = false
    ), 0) AS paid,
    o.price + coalesce((
      SELECT sum(
        CASE WHEN o.currency = 'NGN' THEN om.cost
             ELSE round(om.cost / nullif(o.fx_rate_to_ngn, 0), 2) END
      )
      FROM public.order_materials om
      WHERE om.order_id = o.id AND om.billed_to_client = true
    ), 0) - coalesce((
      SELECT sum(p.amount) FROM public.payments p
      WHERE p.order_id = o.id AND p.voided = false
    ), 0) AS balance,
    o.currency
  FROM public.orders o;
$$;
REVOKE EXECUTE ON FUNCTION public._all_order_balances() FROM PUBLIC, anon, authenticated;

-- Health report: outstanding (both NGN and other-currencies) follows the
-- same billed_to_client rule as order_balances; order profit now treats a
-- billed material as pass-through (no effect either way, since it's
-- already added to the client's total via order_balances) and only an
-- unbilled one as a true cost -- the inconsistency PR P reported.
CREATE OR REPLACE FUNCTION public._compute_health_report(
  p_store_id uuid,
  p_period_month text,
  p_anonymize boolean
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store record;
  v_month_start date;
  v_month_end date; -- exclusive
  v_billed numeric;
  v_orders_created int;
  v_garments_created int;
  v_collected numeric;
  v_outstanding numeric;
  v_order_profit numeric;
  v_profit_rate_missing_count int;
  v_expenses numeric;
  v_net_profit numeric;
  v_orders_completed int;
  v_on_time jsonb;
  v_active_clients int;
  v_repeat_count int;
  v_top_clients jsonb;
  v_garment_breakdown jsonb;
  v_trend jsonb;
  v_has_data boolean;
  v_other_currencies jsonb;
BEGIN
  SELECT id, name, logo_url, city, created_at INTO v_store
  FROM public.stores WHERE id = p_store_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Store not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_period_month !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'Invalid period' USING ERRCODE = '22023';
  END IF;

  v_month_start := to_date(p_period_month || '-01', 'YYYY-MM-DD');
  v_month_end := v_month_start + interval '1 month';

  -- Money (NGN orders only -- see "Other currencies" below for the rest).
  SELECT coalesce(sum(price), 0), count(*), coalesce(sum(quantity), 0)
  INTO v_billed, v_orders_created, v_garments_created
  FROM public.orders
  WHERE store_id = p_store_id AND currency = 'NGN'
    AND created_at >= v_month_start AND created_at < v_month_end;

  SELECT coalesce(sum(amount), 0) INTO v_collected
  FROM public.payments
  WHERE store_id = p_store_id AND voided = false AND currency = 'NGN'
    AND paid_at >= v_month_start AND paid_at < v_month_end;

  -- Outstanding at month end, NGN orders -- same price + billed-material
  -- definition as order_balances, scoped as of that month's end rather
  -- than the live total order_balances itself would give.
  SELECT coalesce(sum(greatest(
    o.price + coalesce((
      SELECT sum(om.cost) FROM public.order_materials om
      WHERE om.order_id = o.id AND om.billed_to_client = true
    ), 0) - coalesce(p.paid, 0), 0)
  ), 0) INTO v_outstanding
  FROM public.orders o
  LEFT JOIN (
    SELECT order_id, sum(amount) AS paid
    FROM public.payments
    WHERE store_id = p_store_id AND voided = false AND paid_at < v_month_end
    GROUP BY order_id
  ) p ON p.order_id = o.id
  WHERE o.store_id = p_store_id AND o.currency = 'NGN' AND o.created_at < v_month_end;

  -- Other currencies: billed/collected/outstanding this month, each in its
  -- own currency, plus an NGN equivalent via each currency's own rate (an
  -- order missing fx_rate_to_ngn is excluded from the NGN-equivalent sum,
  -- never from the currency's own billed/collected/outstanding).
  SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO v_other_currencies
  FROM (
    SELECT
      o.currency,
      coalesce(sum(o.price), 0) AS billed,
      coalesce((
        SELECT sum(amt.amount) FROM (
          SELECT p.amount FROM public.payments p
          JOIN public.orders o2 ON o2.id = p.order_id
          WHERE o2.store_id = p_store_id AND o2.currency = o.currency AND p.voided = false
            AND p.paid_at >= v_month_start AND p.paid_at < v_month_end
        ) amt
      ), 0) AS collected,
      coalesce(sum(greatest(
        o.price + coalesce((
          SELECT sum(om.cost) FROM public.order_materials om
          WHERE om.order_id = o.id AND om.billed_to_client = true
        ), 0) - coalesce((
          SELECT sum(pp.amount) FROM public.payments pp
          WHERE pp.order_id = o.id AND pp.voided = false AND pp.paid_at < v_month_end
        ), 0), 0)
      ), 0) AS outstanding,
      bool_or(o.fx_rate_to_ngn IS NULL) AS rate_missing,
      coalesce(sum(o.price * o.fx_rate_to_ngn) FILTER (WHERE o.fx_rate_to_ngn IS NOT NULL), 0) AS billed_ngn_equivalent
    FROM public.orders o
    WHERE o.store_id = p_store_id AND o.currency <> 'NGN'
      AND o.created_at >= v_month_start AND o.created_at < v_month_end
    GROUP BY o.currency
  ) x;

  -- Profit: order-level (price minus unbilled material cost, labour, other
  -- cost) for orders created this month. A billed material is pass-through
  -- (it's already added to the client's own total via order_balances, so
  -- it neither helps nor hurts profit here); only an unbilled one is a
  -- true cost. A foreign-currency order's price is converted to NGN via
  -- its own fx_rate_to_ngn first (costs are already NGN); one missing its
  -- rate is excluded here and counted instead.
  SELECT
    coalesce(sum(
      (CASE WHEN o.currency = 'NGN' THEN o.price ELSE round(o.price * o.fx_rate_to_ngn, 2) END)
      - (
        coalesce((SELECT sum(m.cost) FROM public.order_materials m
                  WHERE m.order_id = o.id AND m.billed_to_client = false), 0)
        + coalesce(o.labour_cost, 0) + coalesce(o.other_cost, 0)
      )
    ) FILTER (WHERE o.currency = 'NGN' OR o.fx_rate_to_ngn IS NOT NULL), 0),
    count(*) FILTER (WHERE o.currency <> 'NGN' AND o.fx_rate_to_ngn IS NULL)
  INTO v_order_profit, v_profit_rate_missing_count
  FROM public.orders o
  WHERE o.store_id = p_store_id AND o.created_at >= v_month_start AND o.created_at < v_month_end;

  SELECT coalesce(sum(amount), 0) INTO v_expenses
  FROM public.expenses
  WHERE store_id = p_store_id AND spent_at >= v_month_start AND spent_at < v_month_end;

  v_net_profit := v_collected - v_expenses;

  SELECT count(*) INTO v_orders_completed
  FROM public.orders
  WHERE store_id = p_store_id AND collected_at >= v_month_start AND collected_at < v_month_end;

  SELECT * INTO v_on_time FROM public.get_store_on_time_score(p_store_id);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'garment_type', garment_type, 'count', cnt, 'revenue', revenue
  ) ORDER BY revenue DESC), '[]'::jsonb)
  INTO v_garment_breakdown
  FROM (
    SELECT garment_type, count(*) AS cnt, sum(price) AS revenue
    FROM public.orders
    WHERE store_id = p_store_id AND currency = 'NGN'
      AND created_at >= v_month_start AND created_at < v_month_end
    GROUP BY garment_type
  ) g;

  WITH active_clients AS (
    SELECT DISTINCT client_id FROM public.orders
    WHERE store_id = p_store_id AND created_at >= v_month_start AND created_at < v_month_end
    UNION
    SELECT DISTINCT o.client_id FROM public.payments p
    JOIN public.orders o ON o.id = p.order_id
    WHERE p.store_id = p_store_id AND p.voided = false
      AND p.paid_at >= v_month_start AND p.paid_at < v_month_end
  )
  SELECT count(*), count(*) FILTER (
    WHERE (SELECT count(*) FROM public.orders o2 WHERE o2.client_id = ac.client_id) > 1
  )
  INTO v_active_clients, v_repeat_count
  FROM active_clients ac;

  WITH billed_by_client AS (
    SELECT client_id, sum(price) AS amount
    FROM public.orders
    WHERE store_id = p_store_id AND currency = 'NGN'
      AND created_at >= v_month_start AND created_at < v_month_end
    GROUP BY client_id
    ORDER BY amount DESC
    LIMIT 5
  ),
  ranked AS (
    SELECT bc.client_id, c.full_name, bc.amount,
      row_number() OVER (ORDER BY bc.amount DESC) AS rn
    FROM billed_by_client bc
    JOIN public.clients c ON c.id = bc.client_id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'name', CASE WHEN p_anonymize THEN 'Client ' || chr(64 + rn) ELSE full_name END,
    'amount', amount
  ) ORDER BY amount DESC), '[]'::jsonb)
  INTO v_top_clients
  FROM ranked;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'month', to_char(m.month_start, 'YYYY-MM'),
    'billed', coalesce(b.amount, 0),
    'collected', coalesce(c.amount, 0)
  ) ORDER BY m.month_start), '[]'::jsonb)
  INTO v_trend
  FROM generate_series(v_month_start - interval '5 months', v_month_start, interval '1 month') AS m(month_start)
  LEFT JOIN (
    SELECT date_trunc('month', created_at) AS month_start, sum(price) AS amount
    FROM public.orders
    WHERE store_id = p_store_id AND currency = 'NGN'
      AND created_at >= (v_month_start - interval '5 months') AND created_at < v_month_end
    GROUP BY 1
  ) b ON b.month_start = m.month_start
  LEFT JOIN (
    SELECT date_trunc('month', paid_at) AS month_start, sum(amount) AS amount
    FROM public.payments
    WHERE store_id = p_store_id AND voided = false AND currency = 'NGN'
      AND paid_at >= (v_month_start - interval '5 months') AND paid_at < v_month_end
    GROUP BY 1
  ) c ON c.month_start = m.month_start;

  v_has_data := v_orders_created > 0 OR v_collected > 0 OR v_expenses > 0;

  RETURN jsonb_build_object(
    'store_name', v_store.name,
    'store_logo_url', v_store.logo_url,
    'store_city', v_store.city,
    'period_month', p_period_month,
    'is_current_month', to_char(now() AT TIME ZONE 'Africa/Lagos', 'YYYY-MM') = p_period_month,
    'months_on_jaylor', greatest(0, (date_part('year', age(v_month_start, v_store.created_at)) * 12
      + date_part('month', age(v_month_start, v_store.created_at)))::int),
    'has_data', v_has_data,
    'money', jsonb_build_object(
      'billed', v_billed,
      'collected', v_collected,
      'outstanding', v_outstanding,
      'collection_rate', CASE WHEN v_billed > 0 THEN round(v_collected / v_billed * 100, 1) ELSE NULL END,
      'avg_order_value', CASE WHEN v_orders_created > 0 THEN round(v_billed / v_orders_created) ELSE 0 END
    ),
    'profit', jsonb_build_object(
      'order_profit', v_order_profit,
      'margin', CASE WHEN v_billed > 0 THEN round(v_order_profit / v_billed * 100, 1) ELSE NULL END,
      'expenses', v_expenses,
      'net_profit', v_net_profit,
      'rate_missing_count', v_profit_rate_missing_count
    ),
    'work', jsonb_build_object(
      'orders_created', v_orders_created,
      'garments_created', v_garments_created,
      'orders_completed', v_orders_completed,
      'on_time_rate', CASE WHEN (v_on_time ->> 'has_enough_data')::boolean THEN (v_on_time ->> 'rate')::numeric ELSE NULL END,
      'garments_by_type', v_garment_breakdown
    ),
    'clients', jsonb_build_object(
      'active_clients', v_active_clients,
      'repeat_rate', CASE WHEN v_active_clients > 0 THEN round(v_repeat_count::numeric / v_active_clients * 100, 1) ELSE NULL END,
      'top_clients', v_top_clients
    ),
    'trend', v_trend,
    'other_currencies', v_other_currencies
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public._compute_health_report(uuid, text, boolean) FROM PUBLIC, anon, authenticated;

COMMIT;

-- ============================================================
-- Verification: expect every row true, failed_checks empty.
-- ============================================================
SELECT
  bool_and(ok) AS all_true,
  coalesce(array_agg(check_name) FILTER (WHERE NOT ok), ARRAY[]::text[]) AS failed_checks
FROM (
  -- Section 1: moments
  SELECT 'clients.first_order_date exists' AS check_name,
    EXISTS(SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='clients' AND column_name='first_order_date') AS ok
  UNION ALL
  SELECT 'moments table exists', to_regclass('public.moments') IS NOT NULL
  UNION ALL
  SELECT 'moment_settings table exists', to_regclass('public.moment_settings') IS NOT NULL
  UNION ALL
  SELECT 'client_fit_feedback table exists', to_regclass('public.client_fit_feedback') IS NOT NULL
  UNION ALL
  SELECT 'every store has all 7 moment_settings rows', NOT EXISTS (
    SELECT 1 FROM public.stores s
    WHERE (SELECT count(*) FROM public.moment_settings ms WHERE ms.store_id = s.id) <> 7
  )
  UNION ALL
  SELECT 'set_client_first_order_date exists', to_regprocedure('public.set_client_first_order_date()') IS NOT NULL
  UNION ALL
  SELECT 'record_fit_feedback exists', to_regprocedure('public.record_fit_feedback(uuid,uuid,text,text)') IS NOT NULL
  UNION ALL
  SELECT 'create_moment exists', to_regprocedure('public.create_moment(uuid,uuid,text,date,text,uuid,text)') IS NOT NULL
  UNION ALL
  SELECT 'notify_order_ready_moment exists', to_regprocedure('public.notify_order_ready_moment()') IS NOT NULL
  UNION ALL
  SELECT 'notify_order_progress_moment exists', to_regprocedure('public.notify_order_progress_moment()') IS NOT NULL
  UNION ALL
  SELECT 'generate_fitcheck_moments exists', to_regprocedure('public.generate_fitcheck_moments()') IS NOT NULL
  UNION ALL
  SELECT 'generate_birthday_moments exists', to_regprocedure('public.generate_birthday_moments()') IS NOT NULL
  UNION ALL
  SELECT 'generate_anniversary_moments exists', to_regprocedure('public.generate_anniversary_moments()') IS NOT NULL
  UNION ALL
  SELECT 'generate_winback_moments exists', to_regprocedure('public.generate_winback_moments()') IS NOT NULL
  UNION ALL
  SELECT 'generate_festive_moments exists', to_regprocedure('public.generate_festive_moments()') IS NOT NULL
  UNION ALL
  SELECT 'set_client_first_order_date_after_insert trigger exists',
    EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_client_first_order_date_after_insert')
  UNION ALL
  SELECT 'seed_moment_settings_after_store trigger exists',
    EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'seed_moment_settings_after_store')
  UNION ALL
  SELECT 'notify_order_ready_moment_after_update trigger exists',
    EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'notify_order_ready_moment_after_update')
  UNION ALL
  SELECT 'notify_order_progress_moment_after_update trigger exists',
    EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'notify_order_progress_moment_after_update')
  UNION ALL
  SELECT 'moments-daily cron job exists', (
    to_regclass('cron.job') IS NOT NULL
    AND EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'moments-daily')
  )

  -- Section 2: fit-check guest page
  UNION ALL
  SELECT 'get_fitcheck_context exists', to_regprocedure('public.get_fitcheck_context(uuid,uuid)') IS NOT NULL

  -- Section 3: milestones + Style Book
  UNION ALL
  SELECT 'store_milestones table exists', to_regclass('public.store_milestones') IS NOT NULL
  UNION ALL
  SELECT 'check_order_count_milestones exists', to_regprocedure('public.check_order_count_milestones()') IS NOT NULL
  UNION ALL
  SELECT 'check_collected_amount_milestone exists', to_regprocedure('public.check_collected_amount_milestone()') IS NOT NULL
  UNION ALL
  SELECT 'generate_zero_balance_milestones exists', to_regprocedure('public.generate_zero_balance_milestones()') IS NOT NULL
  UNION ALL
  SELECT 'check_order_count_milestones_after_insert trigger exists',
    EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'check_order_count_milestones_after_insert')
  UNION ALL
  SELECT 'check_collected_amount_milestone_after_insert trigger exists',
    EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'check_collected_amount_milestone_after_insert')
  UNION ALL
  SELECT 'milestones-daily cron job exists', (
    to_regclass('cron.job') IS NOT NULL
    AND EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'milestones-daily')
  )
  UNION ALL
  SELECT 'clients.style_book_token exists', EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clients' AND column_name='style_book_token')
  UNION ALL
  SELECT 'clients.style_book_revoked exists', EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clients' AND column_name='style_book_revoked')
  UNION ALL
  SELECT 'get_style_book exists', to_regprocedure('public.get_style_book(uuid)') IS NOT NULL
  UNION ALL
  SELECT 'set_style_book_revoked exists', to_regprocedure('public.set_style_book_revoked(uuid,boolean)') IS NOT NULL

  -- Section 4: job templates
  UNION ALL
  SELECT 'seed_job_templates exists', to_regprocedure('public.seed_job_templates()') IS NOT NULL
  UNION ALL
  SELECT 'on_store_seeded_job_templates trigger exists',
    EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_store_seeded_job_templates')
  UNION ALL
  SELECT 'every store has at least one default job template', NOT EXISTS (
    SELECT 1 FROM public.stores s
    WHERE NOT EXISTS (SELECT 1 FROM public.job_templates t WHERE t.store_id = s.id AND t.is_default)
  )

  -- Section 5: PR P2 billed_to_client, merged forward
  UNION ALL
  SELECT 'order_materials.billed_to_client exists', EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='order_materials' AND column_name='billed_to_client')
  UNION ALL
  SELECT 'no material missing billed_to_client',
    NOT EXISTS(SELECT 1 FROM public.order_materials WHERE billed_to_client IS NULL)
  UNION ALL
  SELECT 'existing tailor-purchased rows backfilled true (balances unchanged)',
    NOT EXISTS(SELECT 1 FROM public.order_materials WHERE source = 'tailor' AND billed_to_client IS NOT true)
  UNION ALL
  SELECT 'existing client-supplied rows backfilled false',
    NOT EXISTS(SELECT 1 FROM public.order_materials WHERE source <> 'tailor' AND billed_to_client IS NOT false)
  UNION ALL
  SELECT 'set_order_material_billed_to_client exists',
    to_regprocedure('public.set_order_material_billed_to_client(uuid,boolean)') IS NOT NULL
  UNION ALL
  SELECT 'anon cannot call set_order_material_billed_to_client', NOT has_function_privilege(
    'anon', 'public.set_order_material_billed_to_client(uuid,boolean)', 'execute'
  )
  UNION ALL
  SELECT 'authenticated can call set_order_material_billed_to_client', has_function_privilege(
    'authenticated', 'public.set_order_material_billed_to_client(uuid,boolean)', 'execute'
  )
  UNION ALL
  SELECT 'use_stock_on_order inserts billed_to_client = false',
    (pg_get_functiondef('public.use_stock_on_order(uuid,uuid,numeric,text)'::regprocedure) ILIKE '%billed_to_client%')
  UNION ALL
  SELECT '_all_order_balances filters by billed_to_client',
    (pg_get_functiondef('public._all_order_balances()'::regprocedure) ILIKE '%billed_to_client%')
  UNION ALL
  SELECT '_compute_health_report filters by billed_to_client',
    (pg_get_functiondef('public._compute_health_report(uuid,text,boolean)'::regprocedure) ILIKE '%billed_to_client%')
) checks;
