-- Consolidated manual apply: everything from PRs #9, #10 and #11 that Lovable
-- Cloud never applied (Lovable does not run migrations pushed from GitHub --
-- confirmed live: dedicated_accounts/incoming_transfers missing, none of
-- match_incoming_transfer/assign_incoming_transfer/ignore_incoming_transfer/
-- get_daily_digest_data/get_weekly_digest_data exist, store_settings is
-- missing alert_transfer_received/digest_daily/digest_weekly, orders is
-- missing labour_cost/other_cost), plus the messages usage-counting fix.
--
-- Deliberately excludes everything from PR #8 and PR #12
-- (enforce_order_limit, enforce_user_limit, feature_usage, the orders
-- usage_counters backfill) -- PR #12 already superseded PR #8 and was
-- applied by hand; this script must not touch any of that.
--
-- Also excludes pg_cron/pg_net scheduling (this project has neither
-- extension installed) -- get_daily_digest_data()/get_weekly_digest_data()
-- themselves are kept; only the cron.schedule(...)/net.http_post(...) block
-- from PR #11 is left out. See the chat report for how to schedule these
-- without pg_cron.
--
-- Safe to run more than once: every CREATE is IF NOT EXISTS/OR REPLACE,
-- every trigger is dropped before recreation, every policy is dropped
-- before recreation. Wrapped in one transaction -- either all of this
-- applies, or none of it does.

BEGIN;

-- ============================================================
-- 1. STEP 1.2 -- Dedicated Virtual Accounts (from PR #9, 20260927120000)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.dedicated_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  paystack_customer_code text,
  paystack_dedicated_account_id text,
  account_number text,
  account_name text,
  bank_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'failed')),
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS dedicated_accounts_store_id_key ON public.dedicated_accounts (store_id);

CREATE OR REPLACE FUNCTION public.set_dedicated_account_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_dedicated_account_updated_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS set_dedicated_account_updated_at_trigger ON public.dedicated_accounts;
CREATE TRIGGER set_dedicated_account_updated_at_trigger
BEFORE UPDATE ON public.dedicated_accounts
FOR EACH ROW EXECUTE FUNCTION public.set_dedicated_account_updated_at();

ALTER TABLE public.dedicated_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dedicated_accounts_select ON public.dedicated_accounts;
CREATE POLICY dedicated_accounts_select ON public.dedicated_accounts FOR SELECT TO authenticated
  USING (public.is_store_member(store_id));

-- Writes only ever come from the create-dedicated-account edge function and
-- the paystack-webhook function, both of which use the service role and so
-- bypass RLS -- no authenticated INSERT/UPDATE/DELETE policy is needed.

GRANT SELECT ON public.dedicated_accounts TO authenticated;
GRANT ALL ON public.dedicated_accounts TO service_role;

CREATE TABLE IF NOT EXISTS public.incoming_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  sender_name text,
  sender_bank text,
  paystack_ref text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'unmatched' CHECK (status IN ('matched', 'unmatched', 'ignored')),
  matched_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Idempotency key: the webhook upserts on this so a replayed event never
-- creates a second transfer row (and therefore never double-matches).
CREATE UNIQUE INDEX IF NOT EXISTS incoming_transfers_paystack_ref_key ON public.incoming_transfers (paystack_ref);
CREATE INDEX IF NOT EXISTS incoming_transfers_store_id_idx ON public.incoming_transfers (store_id, received_at DESC);

ALTER TABLE public.incoming_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS incoming_transfers_select ON public.incoming_transfers;
CREATE POLICY incoming_transfers_select ON public.incoming_transfers FOR SELECT TO authenticated
  USING (public.is_store_member(store_id));

-- Mutations (assigning or ignoring a transfer) go through the
-- assign_incoming_transfer()/ignore_incoming_transfer() functions below,
-- which check has_store_role() themselves -- no direct authenticated
-- INSERT/UPDATE/DELETE policy is needed on the table.

GRANT SELECT ON public.incoming_transfers TO authenticated;
GRANT ALL ON public.incoming_transfers TO service_role;

-- Plain-SQL fuzzy name match (no pg_trgm dependency): fraction of
-- normalized whitespace-split words the two names have in common, out of
-- the larger name's word count. "Chidinma Okafor" vs "Okafor C." -> a
-- partial-but-nonzero score; identical names -> 1.
CREATE OR REPLACE FUNCTION public.name_similarity(a text, b text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH aw AS (
    SELECT DISTINCT word FROM unnest(
      string_to_array(regexp_replace(lower(coalesce(a, '')), '[^a-z0-9 ]', '', 'g'), ' ')
    ) AS word WHERE word <> ''
  ), bw AS (
    SELECT DISTINCT word FROM unnest(
      string_to_array(regexp_replace(lower(coalesce(b, '')), '[^a-z0-9 ]', '', 'g'), ' ')
    ) AS word WHERE word <> ''
  )
  SELECT CASE
    WHEN (SELECT count(*) FROM aw) = 0 OR (SELECT count(*) FROM bw) = 0 THEN 0
    ELSE (SELECT count(*) FROM aw JOIN bw USING (word))::numeric
         / GREATEST((SELECT count(*) FROM aw), (SELECT count(*) FROM bw))
  END;
$$;
REVOKE EXECUTE ON FUNCTION public.name_similarity(text, text) FROM PUBLIC, anon, authenticated;

-- Final form directly (PR #9 shipped a void-returning version, PR #11
-- changed it to return uuid so the webhook can fire the transfer-received
-- alert -- since neither has ever been applied live, this goes straight to
-- the uuid-returning version). The DROP is defensive: harmless on a fresh
-- apply, and safe if an earlier void-returning version ever did get created
-- by hand (CREATE OR REPLACE can't change an existing function's return
-- type).
DROP FUNCTION IF EXISTS public.match_incoming_transfer(uuid);

CREATE FUNCTION public.match_incoming_transfer(p_transfer_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer public.incoming_transfers%ROWTYPE;
  v_order_id uuid;
  v_count int;
BEGIN
  SELECT * INTO v_transfer FROM public.incoming_transfers WHERE id = p_transfer_id;
  IF NOT FOUND OR v_transfer.status <> 'unmatched' THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.order_balances b
  JOIN public.orders o ON o.id = b.order_id
  JOIN public.clients c ON c.id = o.client_id
  WHERE b.store_id = v_transfer.store_id
    AND o.status <> 'cancelled'
    AND b.balance = v_transfer.amount
    AND public.name_similarity(v_transfer.sender_name, c.full_name) >= 0.34;

  IF v_count = 1 THEN
    SELECT o.id INTO v_order_id
    FROM public.order_balances b
    JOIN public.orders o ON o.id = b.order_id
    JOIN public.clients c ON c.id = o.client_id
    WHERE b.store_id = v_transfer.store_id
      AND o.status <> 'cancelled'
      AND b.balance = v_transfer.amount
      AND public.name_similarity(v_transfer.sender_name, c.full_name) >= 0.34
    ORDER BY o.created_at DESC
    LIMIT 1;

    INSERT INTO public.payments (store_id, order_id, amount, method, reference, paid_at)
    VALUES (v_transfer.store_id, v_order_id, v_transfer.amount, 'transfer', v_transfer.paystack_ref, v_transfer.received_at);

    UPDATE public.incoming_transfers
    SET status = 'matched', matched_order_id = v_order_id
    WHERE id = p_transfer_id;

    RETURN v_order_id;
  END IF;

  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.match_incoming_transfer(uuid) FROM PUBLIC, anon, authenticated;

-- Owner/manager assigns an unmatched (or splits one across several) order(s)
-- from the Unmatched payments screen. Runs as one transaction: any bad
-- allocation aborts the whole call, so partial payments rows are never left
-- behind.
CREATE OR REPLACE FUNCTION public.assign_incoming_transfer(p_transfer_id uuid, p_allocations jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer public.incoming_transfers%ROWTYPE;
  v_alloc jsonb;
  v_order_id uuid;
  v_amount numeric;
  v_sum numeric;
  v_count int;
  v_idx int := 0;
BEGIN
  SELECT * INTO v_transfer FROM public.incoming_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer not found' USING ERRCODE = 'P0102';
  END IF;
  IF NOT public.has_store_role(v_transfer.store_id, ARRAY['owner'::store_role, 'manager'::store_role]) THEN
    RAISE EXCEPTION 'You do not have permission to do this' USING ERRCODE = 'P0103';
  END IF;
  IF v_transfer.status = 'matched' THEN
    RAISE EXCEPTION 'This transfer has already been assigned' USING ERRCODE = 'P0104';
  END IF;

  SELECT count(*), coalesce(sum((elem ->> 'amount')::numeric), 0)
    INTO v_count, v_sum
    FROM jsonb_array_elements(p_allocations) elem;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Choose at least one order' USING ERRCODE = 'P0105';
  END IF;
  IF v_sum > v_transfer.amount THEN
    RAISE EXCEPTION 'Allocations add up to more than the transfer amount' USING ERRCODE = 'P0107';
  END IF;

  FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_idx := v_idx + 1;
    v_order_id := (v_alloc ->> 'order_id')::uuid;
    v_amount := (v_alloc ->> 'amount')::numeric;
    IF v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'Each allocation needs a positive amount' USING ERRCODE = 'P0105';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.orders WHERE id = v_order_id AND store_id = v_transfer.store_id
    ) THEN
      RAISE EXCEPTION 'Order does not belong to this store' USING ERRCODE = 'P0106';
    END IF;

    INSERT INTO public.payments (store_id, order_id, amount, method, reference, paid_at)
    VALUES (
      v_transfer.store_id,
      v_order_id,
      v_amount,
      'transfer',
      CASE WHEN v_count > 1 THEN v_transfer.paystack_ref || ':' || v_idx ELSE v_transfer.paystack_ref END,
      v_transfer.received_at
    );
  END LOOP;

  UPDATE public.incoming_transfers
  SET status = 'matched',
      matched_order_id = CASE WHEN v_count = 1 THEN ((p_allocations -> 0) ->> 'order_id')::uuid ELSE NULL END
  WHERE id = p_transfer_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.assign_incoming_transfer(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_incoming_transfer(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.ignore_incoming_transfer(p_transfer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
BEGIN
  SELECT store_id INTO v_store_id FROM public.incoming_transfers WHERE id = p_transfer_id;
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Transfer not found' USING ERRCODE = 'P0102';
  END IF;
  IF NOT public.has_store_role(v_store_id, ARRAY['owner'::store_role, 'manager'::store_role]) THEN
    RAISE EXCEPTION 'You do not have permission to do this' USING ERRCODE = 'P0103';
  END IF;
  UPDATE public.incoming_transfers SET status = 'ignored' WHERE id = p_transfer_id AND status = 'unmatched';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ignore_incoming_transfer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ignore_incoming_transfer(uuid) TO authenticated;

-- Public read for the storefront/receipt/quote "pay by transfer" display --
-- only the active account's display fields, only for an active shop.
CREATE OR REPLACE FUNCTION public.get_storefront_payout_account(p_store_id uuid)
RETURNS TABLE(account_number text, account_name text, bank_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT da.account_number, da.account_name, da.bank_name
  FROM public.dedicated_accounts da
  JOIN public.stores s ON s.id = da.store_id
  WHERE da.store_id = p_store_id AND da.status = 'active' AND s.is_active = true;
$$;
REVOKE EXECUTE ON FUNCTION public.get_storefront_payout_account(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_storefront_payout_account(uuid) TO anon, authenticated;

-- ============================================================
-- 2. STEP 1.4 -- Profit per order (from PR #10, 20260927130000)
-- ============================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS labour_cost numeric CHECK (labour_cost IS NULL OR labour_cost >= 0),
  ADD COLUMN IF NOT EXISTS other_cost numeric CHECK (other_cost IS NULL OR other_cost >= 0);

-- ============================================================
-- 3. STEP 1.3 -- Owner alerts and digests (from PR #11, 20260927140000),
--    minus the pg_cron/pg_net scheduling block -- this project has neither
--    extension installed. get_daily_digest_data()/get_weekly_digest_data()
--    themselves are kept; nothing calls them on a schedule yet.
-- ============================================================

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS alert_transfer_received boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS digest_daily boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS digest_weekly boolean NOT NULL DEFAULT true;

-- Backing data for both the daily digest email/WhatsApp text and the
-- dashboard's "Today" card, so the numbers shown in both places always
-- agree. Callable by a signed-in owner/manager (dashboard) or by the
-- service role (the digest sender, which has no auth.uid() of its own).
CREATE OR REPLACE FUNCTION public.get_daily_digest_data(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_due_today jsonb;
  v_due_next3 jsonb;
  v_overdue jsonb;
  v_outstanding numeric;
  v_top3 jsonb;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.has_store_role(p_store_id, ARRAY['owner'::store_role, 'manager'::store_role]) THEN
    RAISE EXCEPTION 'You do not have permission to do this' USING ERRCODE = 'P0103';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'order_id', o.id, 'number', o.number, 'garment_type', o.garment_type, 'client_name', c.full_name
  )), '[]'::jsonb) INTO v_due_today
  FROM public.orders o JOIN public.clients c ON c.id = o.client_id
  WHERE o.store_id = p_store_id AND o.status NOT IN ('collected', 'cancelled')
    AND o.delivery_date::date = current_date;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'order_id', o.id, 'number', o.number, 'garment_type', o.garment_type, 'client_name', c.full_name,
    'delivery_date', o.delivery_date
  )), '[]'::jsonb) INTO v_due_next3
  FROM public.orders o JOIN public.clients c ON c.id = o.client_id
  WHERE o.store_id = p_store_id AND o.status NOT IN ('collected', 'cancelled')
    AND o.delivery_date::date BETWEEN current_date + 1 AND current_date + 3;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'order_id', o.id, 'number', o.number, 'garment_type', o.garment_type, 'client_name', c.full_name,
    'delivery_date', o.delivery_date
  )), '[]'::jsonb) INTO v_overdue
  FROM public.orders o JOIN public.clients c ON c.id = o.client_id
  WHERE o.store_id = p_store_id AND o.status NOT IN ('collected', 'cancelled')
    AND o.delivery_date::date < current_date;

  SELECT coalesce(sum(balance), 0) INTO v_outstanding
  FROM public.order_balances WHERE store_id = p_store_id;

  SELECT coalesce(jsonb_agg(t), '[]'::jsonb) INTO v_top3
  FROM (
    SELECT c.full_name AS client_name, b.balance, o.number
    FROM public.order_balances b
    JOIN public.orders o ON o.id = b.order_id
    JOIN public.clients c ON c.id = o.client_id
    WHERE b.store_id = p_store_id AND b.balance > 0
    ORDER BY b.balance DESC
    LIMIT 3
  ) t;

  RETURN jsonb_build_object(
    'due_today', v_due_today,
    'due_next_3_days', v_due_next3,
    'overdue', v_overdue,
    'outstanding_total', v_outstanding,
    'top_balances', v_top3
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_daily_digest_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_daily_digest_data(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_weekly_digest_data(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_orders int;
  v_billed numeric;
  v_collected numeric;
  v_outstanding numeric;
  v_overdue_count int;
  v_garments_due numeric;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.has_store_role(p_store_id, ARRAY['owner'::store_role, 'manager'::store_role]) THEN
    RAISE EXCEPTION 'You do not have permission to do this' USING ERRCODE = 'P0103';
  END IF;

  SELECT count(*), coalesce(sum(price), 0) INTO v_new_orders, v_billed
  FROM public.orders WHERE store_id = p_store_id AND created_at >= now() - interval '7 days';

  SELECT coalesce(sum(amount), 0) INTO v_collected
  FROM public.payments
  WHERE store_id = p_store_id AND voided = false AND paid_at >= now() - interval '7 days';

  SELECT coalesce(sum(balance), 0) INTO v_outstanding
  FROM public.order_balances WHERE store_id = p_store_id;

  SELECT count(*) INTO v_overdue_count
  FROM public.orders
  WHERE store_id = p_store_id AND status NOT IN ('collected', 'cancelled')
    AND delivery_date::date < current_date;

  SELECT coalesce(sum(quantity), 0) INTO v_garments_due
  FROM public.orders
  WHERE store_id = p_store_id AND status NOT IN ('collected', 'cancelled')
    AND delivery_date::date BETWEEN current_date AND current_date + 6;

  RETURN jsonb_build_object(
    'new_orders', v_new_orders,
    'billed', v_billed,
    'collected', v_collected,
    'outstanding_total', v_outstanding,
    'overdue_count', v_overdue_count,
    'garments_due_this_week', v_garments_due
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_weekly_digest_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_weekly_digest_data(uuid) TO authenticated, service_role;

-- ============================================================
-- 4. Message-counting fix: only an actual automatic send should count
--    toward whatsapp_auto -- tap-to-send (channel = 'tap') is promised free
--    and unlimited on every plan (see the pricing FAQ) but was being counted
--    unconditionally. track_message_usage() is the only thing that
--    increments usage_counters.messages (via messages_track_usage, AFTER
--    INSERT ON public.messages); this is its live definition with a single
--    added guard, not a rewrite.
-- ============================================================

CREATE OR REPLACE FUNCTION public.track_message_usage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if new.channel is distinct from 'tap' then
    perform public.increment_usage_counter(new.store_id, 'messages');
  end if;
  return new;
end;
$function$;

-- One-time backfill for the current Lagos month: recompute
-- usage_counters.messages down to the real count of non-tap sends, for
-- every store that already has a row for this month. Since every message
-- ever logged so far has channel = 'tap' (confirmed live), this currently
-- zeroes out counters that were incorrectly inflated by tap-to-send taps --
-- it never raises a counter, only corrects it down to the truth.
DO $$
DECLARE
  v_month text := to_char(now() AT TIME ZONE 'Africa/Lagos', 'YYYY-MM');
  v_month_start timestamptz := date_trunc('month', now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos';
  v_month_end timestamptz := v_month_start + interval '1 month';
BEGIN
  UPDATE public.usage_counters uc
  SET messages = coalesce((
    SELECT count(*) FROM public.messages m
    WHERE m.store_id = uc.store_id
      AND m.channel IS DISTINCT FROM 'tap'
      AND m.created_at >= v_month_start AND m.created_at < v_month_end
  ), 0)
  WHERE uc.month = v_month;
END;
$$;

-- ============================================================
-- 5. Verification -- one row, every object this script is responsible for.
-- ============================================================

SELECT
  (to_regclass('public.dedicated_accounts') IS NOT NULL) AS dedicated_accounts_table,
  (to_regclass('public.incoming_transfers') IS NOT NULL) AS incoming_transfers_table,
  (to_regprocedure('public.name_similarity(text,text)') IS NOT NULL) AS name_similarity_fn,
  (to_regprocedure('public.match_incoming_transfer(uuid)') IS NOT NULL) AS match_incoming_transfer_fn,
  (to_regprocedure('public.assign_incoming_transfer(uuid,jsonb)') IS NOT NULL) AS assign_incoming_transfer_fn,
  (to_regprocedure('public.ignore_incoming_transfer(uuid)') IS NOT NULL) AS ignore_incoming_transfer_fn,
  (to_regprocedure('public.get_storefront_payout_account(uuid)') IS NOT NULL) AS get_storefront_payout_account_fn,
  (to_regprocedure('public.get_daily_digest_data(uuid)') IS NOT NULL) AS get_daily_digest_data_fn,
  (to_regprocedure('public.get_weekly_digest_data(uuid)') IS NOT NULL) AS get_weekly_digest_data_fn,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'store_settings' AND column_name = 'alert_transfer_received'
  ) AS store_settings_alert_transfer_received,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'store_settings' AND column_name = 'digest_daily'
  ) AS store_settings_digest_daily,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'store_settings' AND column_name = 'digest_weekly'
  ) AS store_settings_digest_weekly,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'labour_cost'
  ) AS orders_labour_cost,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'other_cost'
  ) AS orders_other_cost,
  (pg_get_functiondef('public.track_message_usage()'::regprocedure) ILIKE '%tap%') AS track_message_usage_excludes_tap;

COMMIT;
