-- PR A: client order tracking page (/t/$token).
--
-- Adds an unguessable per-order tracking token, lets staff attach a photo/note
-- to a status change, and exposes both through a SECURITY DEFINER function so
-- the public tracking page never touches orders/order_status_history/stores
-- directly. Safe to run more than once.

BEGIN;

-- 1. Tracking token. Volatile DEFAULT (gen_random_uuid()) means Postgres
--    actually rewrites the table and calls the function per existing row
--    rather than taking the fast metadata-only path, so this single
--    ALTER TABLE also backfills a distinct token for every order already in
--    the table -- no separate backfill statement needed.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tracking_token uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS orders_tracking_token_key ON public.orders (tracking_token);

-- 2. Optional photo/note per status-history row, so a staff member can attach
--    a progress photo (private bucket, online-only upload) or a short note
--    when they move an order to a new status.
ALTER TABLE public.order_status_history
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS note text;

-- 3. Private bucket for progress photos, member-scoped by store folder --
--    same posture as the existing order-style-photos bucket.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'order-progress-photos',
  'order-progress-photos',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS order_progress_photos_member_read ON storage.objects;
CREATE POLICY order_progress_photos_member_read
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'order-progress-photos'
    AND is_store_member((split_part(name, '/', 1))::uuid)
  );

DROP POLICY IF EXISTS order_progress_photos_member_insert ON storage.objects;
CREATE POLICY order_progress_photos_member_insert
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'order-progress-photos'
    AND is_store_member((split_part(name, '/', 1))::uuid)
  );

-- 4. orders_for_tailor is a plain column-allowlist view (no filtering logic of
--    its own) -- recreated with the same column list plus tracking_token, so
--    tailors can also see and share an order's tracking link.
CREATE OR REPLACE VIEW public.orders_for_tailor AS
SELECT
  id, store_id, number, client_id, garment_type, style_notes,
  measurement_set_id, quantity, delivery_date, status, priority,
  assigned_to, ready_at, collected_at, created_by, created_at, updated_at,
  style_reference_photos, tracking_token
FROM public.orders;

-- 5. Staff-only: attach a note/photo to the most recent history row for a
--    given order+status (called right after the plain `orders.status` update
--    that the existing log_order_status_change() trigger already turns into
--    a history row -- this only enriches that row, it never inserts one).
CREATE OR REPLACE FUNCTION public.set_order_status_note(
  p_order_id uuid,
  p_to_status text,
  p_note text DEFAULT NULL,
  p_photo_path text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
BEGIN
  SELECT store_id INTO v_store_id FROM public.orders WHERE id = p_order_id;
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0102';
  END IF;
  IF NOT public.is_store_member(v_store_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.order_status_history
  SET note = coalesce(p_note, note),
      photo_url = coalesce(p_photo_path, photo_url)
  WHERE id = (
    SELECT id FROM public.order_status_history
    WHERE order_id = p_order_id AND to_status = p_to_status
    ORDER BY changed_at DESC
    LIMIT 1
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_order_status_note(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_order_status_note(uuid, text, text, text) TO authenticated;

-- 6. Public read for the /t/$token tracking page. Everything the page needs
--    in one call, keyed by the unguessable tracking_token -- no direct table
--    access from the public client. photo_url values are storage paths
--    (private bucket); the caller signs them server-side before display.
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
    'jaylor_pay_available', coalesce(v_jaylor_pay, false)
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_order_tracking(uuid) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.get_order_tracking(uuid) TO anon, authenticated;

-- 7. Verification -- one row, every object this script is responsible for.
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'tracking_token'
  ) AS orders_tracking_token,
  (to_regclass('public.orders_tracking_token_key') IS NOT NULL) AS tracking_token_unique_index,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_status_history' AND column_name = 'photo_url'
  ) AS order_status_history_photo_url,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_status_history' AND column_name = 'note'
  ) AS order_status_history_note,
  EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'order-progress-photos'
  ) AS order_progress_photos_bucket,
  (to_regprocedure('public.set_order_status_note(uuid,text,text,text)') IS NOT NULL) AS set_order_status_note_fn,
  (to_regprocedure('public.get_order_tracking(uuid)') IS NOT NULL) AS get_order_tracking_fn,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders_for_tailor' AND column_name = 'tracking_token'
  ) AS orders_for_tailor_tracking_token;

COMMIT;
