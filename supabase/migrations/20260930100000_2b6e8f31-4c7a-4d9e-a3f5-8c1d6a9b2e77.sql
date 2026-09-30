-- PR B: client approval before cutting.
--
-- Depends on PR A's SQL (adds orders.tracking_token / recreates
-- orders_for_tailor) having already been applied -- this script recreates
-- orders_for_tailor again, and needs PR A's tracking_token column present in
-- that same recreation so it isn't dropped. Safe to run more than once.

BEGIN;

-- 1. Promised delivery date. Set from delivery_date on insert, and from then
--    on only moves when a client approves a snapshot that carries a new
--    delivery_date (see respond_to_order_approval below).
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS promised_date date;

UPDATE public.orders SET promised_date = delivery_date WHERE promised_date IS NULL;

CREATE OR REPLACE FUNCTION public.set_order_promised_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.promised_date IS NULL THEN
    NEW.promised_date := NEW.delivery_date;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_order_promised_date() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS set_order_promised_date_trigger ON public.orders;
CREATE TRIGGER set_order_promised_date_trigger
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_order_promised_date();

-- 2. orders_for_tailor is a plain column-allowlist view (no filtering logic
--    of its own) -- recreated with PR A's tracking_token plus promised_date,
--    so tailors can also see the promised delivery date.
CREATE OR REPLACE VIEW public.orders_for_tailor AS
SELECT
  id, store_id, number, client_id, garment_type, style_notes,
  measurement_set_id, quantity, delivery_date, status, priority,
  assigned_to, ready_at, collected_at, created_by, created_at, updated_at,
  style_reference_photos, tracking_token, promised_date
FROM public.orders;

-- 3. Approval requests. One row per request; a new change always gets a new
--    row (and a new token) rather than editing an existing one, so a
--    snapshot already sent to a client can never be altered after the fact.
CREATE TABLE IF NOT EXISTS public.order_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'changes_requested')),
  snapshot jsonb NOT NULL,
  client_comment text,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS order_approvals_token_key ON public.order_approvals (token);
CREATE INDEX IF NOT EXISTS order_approvals_order_id_idx ON public.order_approvals (order_id, created_at DESC);

ALTER TABLE public.order_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_approvals_select ON public.order_approvals;
CREATE POLICY order_approvals_select ON public.order_approvals FOR SELECT TO authenticated
  USING (public.is_store_member(store_id));

-- Mutations (creating a request, responding to one) go through the
-- SECURITY DEFINER functions below, which check permissions/the token
-- themselves -- no direct authenticated INSERT/UPDATE/DELETE policy is
-- needed on the table, same posture as incoming_transfers.

GRANT SELECT ON public.order_approvals TO authenticated;
GRANT ALL ON public.order_approvals TO service_role;

-- 4. Staff-only: build a frozen snapshot and send a new approval request.
--    Freezes fabric details/photos from order_materials, style reference
--    photos/notes, the linked measurement set's values, price, amount paid
--    and delivery_date -- exactly what the client is being asked to approve.
CREATE OR REPLACE FUNCTION public.create_order_approval_request(p_order_id uuid)
RETURNS public.order_approvals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_materials jsonb;
  v_measurements jsonb;
  v_paid numeric;
  v_row public.order_approvals%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0102';
  END IF;
  IF NOT public.is_store_member(v_order.store_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'description', m.description,
    'colour', m.colour,
    'yards', m.yards,
    'cost', m.cost,
    'cost_per_yard', m.cost_per_yard,
    'source', m.source,
    'photo_url', m.photo_url
  )), '[]'::jsonb) INTO v_materials
  FROM public.order_materials m
  WHERE m.order_id = p_order_id;

  IF v_order.measurement_set_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'values', ms.values,
      'extra_fields', ms.extra_fields,
      'unit', ms.unit,
      'taken_at', ms.taken_at
    ) INTO v_measurements
    FROM public.measurement_sets ms
    WHERE ms.id = v_order.measurement_set_id;
  END IF;

  SELECT paid INTO v_paid FROM public.order_balances WHERE order_id = p_order_id;

  INSERT INTO public.order_approvals (order_id, store_id, snapshot)
  VALUES (
    p_order_id,
    v_order.store_id,
    jsonb_build_object(
      'garment_type', v_order.garment_type,
      'quantity', v_order.quantity,
      'materials', v_materials,
      'style_reference_photos', to_jsonb(coalesce(v_order.style_reference_photos, ARRAY[]::text[])),
      'style_notes', v_order.style_notes,
      'measurements', v_measurements,
      'price', v_order.price,
      'amount_paid', coalesce(v_paid, 0),
      'delivery_date', v_order.delivery_date
    )
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_order_approval_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order_approval_request(uuid) TO authenticated;

-- 5. Public read for the /a/$token approval page -- keyed by the
--    unguessable token, never a direct table read from the public client.
CREATE OR REPLACE FUNCTION public.get_order_approval(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_approval public.order_approvals%ROWTYPE;
  v_store record;
BEGIN
  SELECT * INTO v_approval FROM public.order_approvals WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT name, logo_url INTO v_store FROM public.stores WHERE id = v_approval.store_id;

  RETURN jsonb_build_object(
    'store_name', coalesce(v_store.name, 'Jaylor'),
    'store_logo_url', v_store.logo_url,
    'status', v_approval.status,
    'snapshot', v_approval.snapshot,
    'client_comment', v_approval.client_comment,
    'responded_at', v_approval.responded_at,
    'created_at', v_approval.created_at
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_order_approval(uuid) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.get_order_approval(uuid) TO anon, authenticated;

-- 6. The client's response. Only valid while still pending; approving a
--    snapshot whose delivery_date differs from the order's current
--    promised_date moves promised_date to match -- the only path that ever
--    changes it after insert.
CREATE OR REPLACE FUNCTION public.respond_to_order_approval(
  p_token uuid,
  p_status text,
  p_comment text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_approval public.order_approvals%ROWTYPE;
  v_snapshot_delivery_date date;
BEGIN
  IF p_status NOT IN ('approved', 'changes_requested') THEN
    RAISE EXCEPTION 'Invalid response' USING ERRCODE = 'P0105';
  END IF;

  SELECT * INTO v_approval FROM public.order_approvals WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval request not found' USING ERRCODE = 'P0102';
  END IF;
  IF v_approval.status <> 'pending' THEN
    RAISE EXCEPTION 'This request has already been responded to' USING ERRCODE = 'P0104';
  END IF;

  UPDATE public.order_approvals
  SET status = p_status,
      client_comment = p_comment,
      responded_at = now()
  WHERE id = v_approval.id;

  IF p_status = 'approved' THEN
    v_snapshot_delivery_date := (v_approval.snapshot ->> 'delivery_date')::date;
    IF v_snapshot_delivery_date IS NOT NULL THEN
      UPDATE public.orders
      SET promised_date = v_snapshot_delivery_date
      WHERE id = v_approval.order_id AND promised_date IS DISTINCT FROM v_snapshot_delivery_date;
    END IF;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.respond_to_order_approval(uuid, text, text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_order_approval(uuid, text, text) TO anon, authenticated;

-- 7. Verification -- one row, every object this script is responsible for.
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'promised_date'
  ) AS orders_promised_date,
  (to_regprocedure('public.set_order_promised_date()') IS NOT NULL) AS set_order_promised_date_fn,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders_for_tailor' AND column_name = 'promised_date'
  ) AS orders_for_tailor_promised_date,
  (to_regclass('public.order_approvals') IS NOT NULL) AS order_approvals_table,
  (to_regclass('public.order_approvals_token_key') IS NOT NULL) AS order_approvals_token_unique_index,
  (to_regprocedure('public.create_order_approval_request(uuid)') IS NOT NULL) AS create_order_approval_request_fn,
  (to_regprocedure('public.get_order_approval(uuid)') IS NOT NULL) AS get_order_approval_fn,
  (to_regprocedure('public.respond_to_order_approval(uuid,text,text)') IS NOT NULL) AS respond_to_order_approval_fn;

COMMIT;
