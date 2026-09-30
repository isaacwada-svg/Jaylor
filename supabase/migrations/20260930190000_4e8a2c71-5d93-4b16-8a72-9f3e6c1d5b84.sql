-- PR L: Local languages, part 1 (framework + client-facing pages).
--
-- Before writing this, checked which public token functions are tracked in
-- this repo's own migration history (safe to CREATE OR REPLACE) versus live
-- only (not touched, per this session's established caution): get_order_tracking
-- and get_order_approval are both tracked, so both are extended in place below
-- to carry the two new language fields. get_participant_by_token (/e/$token)
-- and the stores_public view (storefront) are NOT tracked in any migration
-- here, so rather than guess their live bodies, this adds small new,
-- purpose-built functions instead (get_event_language_context,
-- get_store_language_by_slug) that read only the two new columns and nothing
-- else -- zero risk to whatever those untracked objects currently do.
-- /q/$token (quotes.functions.ts) reads clients/stores directly via the
-- service-role client already, so no SQL function needed there at all --
-- the two new columns just need adding to its existing select() list.
-- Safe to run more than once.

BEGIN;

-- 1. The two new columns this whole feature is keyed on.
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en';
ALTER TABLE public.stores DROP CONSTRAINT IF EXISTS stores_language_check;
ALTER TABLE public.stores ADD CONSTRAINT stores_language_check
  CHECK (language IN ('en', 'pcm', 'ha', 'yo', 'ig'));

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS preferred_language text;
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_preferred_language_check;
ALTER TABLE public.clients ADD CONSTRAINT clients_preferred_language_check
  CHECK (preferred_language IS NULL OR preferred_language IN ('en', 'pcm', 'ha', 'yo', 'ig'));

-- 2. get_order_tracking(): unchanged except for the two new fields, needed so
--    /t/$token can resolve "the order's client preferred language" and "the
--    shop's language" without a second round trip.
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
  v_client_language text;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE tracking_token = p_token;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT name, logo_url, language INTO v_store FROM public.stores WHERE id = v_order.store_id;
  SELECT preferred_language INTO v_client_language FROM public.clients WHERE id = v_order.client_id;

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
    'store_language', v_store.language,
    'client_preferred_language', v_client_language,
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

-- 3. get_order_approval(): same addition for /a/$token.
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
  v_client_language text;
BEGIN
  SELECT * INTO v_approval FROM public.order_approvals WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT name, logo_url, language INTO v_store FROM public.stores WHERE id = v_approval.store_id;

  SELECT cl.preferred_language INTO v_client_language
  FROM public.orders o
  JOIN public.clients cl ON cl.id = o.client_id
  WHERE o.id = v_approval.order_id;

  RETURN jsonb_build_object(
    'store_name', coalesce(v_store.name, 'Jaylor'),
    'store_logo_url', v_store.logo_url,
    'store_language', v_store.language,
    'client_preferred_language', v_client_language,
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

-- 4. New, narrow functions for the two public pages whose current read path
--    is untracked here (get_participant_by_token, the stores_public view) --
--    rather than guess at and rewrite either, these read only the two new
--    language columns and nothing else, so they carry zero risk to whatever
--    those untracked objects currently do.
CREATE OR REPLACE FUNCTION public.get_event_language_context(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_participant record;
  v_store_language text;
  v_client_language text;
BEGIN
  SELECT store_id, client_id INTO v_participant
  FROM public.event_participants WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('store_language', NULL, 'client_preferred_language', NULL);
  END IF;

  SELECT language INTO v_store_language FROM public.stores WHERE id = v_participant.store_id;
  IF v_participant.client_id IS NOT NULL THEN
    SELECT preferred_language INTO v_client_language
    FROM public.clients WHERE id = v_participant.client_id;
  END IF;

  RETURN jsonb_build_object('store_language', v_store_language, 'client_preferred_language', v_client_language);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_event_language_context(uuid) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.get_event_language_context(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_store_language_by_slug(p_slug text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT language FROM public.stores WHERE slug = p_slug;
$$;
REVOKE EXECUTE ON FUNCTION public.get_store_language_by_slug(text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.get_store_language_by_slug(text) TO anon, authenticated;

-- 5. Verification -- one row: all_true, and which checks (if any) failed.
SELECT
  bool_and(v) AS all_true,
  coalesce(string_agg(k, ', ') FILTER (WHERE NOT v), 'none') AS failed_checks
FROM (VALUES
  ('stores_language_column', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stores' AND column_name = 'language'
  )),
  ('clients_preferred_language_column', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'preferred_language'
  )),
  ('get_order_tracking_fn', to_regprocedure('public.get_order_tracking(uuid)') IS NOT NULL),
  ('get_order_approval_fn', to_regprocedure('public.get_order_approval(uuid)') IS NOT NULL),
  ('get_event_language_context_fn', to_regprocedure('public.get_event_language_context(uuid)') IS NOT NULL),
  ('get_store_language_by_slug_fn', to_regprocedure('public.get_store_language_by_slug(text)') IS NOT NULL)
) AS checks(k, v);

COMMIT;
