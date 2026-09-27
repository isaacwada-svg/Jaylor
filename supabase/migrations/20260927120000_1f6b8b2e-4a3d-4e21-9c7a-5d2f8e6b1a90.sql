-- Dedicated Virtual Accounts (Growth+): each shop can get its own bank
-- account number (a Paystack Dedicated Virtual Account) tied to its existing
-- Paystack subaccount, so a client can pay by plain bank transfer and the
-- money still settles to the tailor's own bank with Jaylor's percentage fee
-- applied automatically -- same split as Jaylor Pay today.
--
-- Two new tables:
--   dedicated_accounts  -- one row per store: the assigned account number
--                           and its Paystack customer/assignment status.
--   incoming_transfers  -- one row per bank-transfer credit received on that
--                           account, auto-matched to an order where possible.
--
-- Idempotent throughout: safe to re-run after a partial failure.

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

-- Called by the webhook right after a new (not replayed) incoming_transfers
-- row is inserted. Matches on exact amount vs a store's open-order balance
-- and a plausible sender-name overlap, most recent order first; anything
-- ambiguous (zero or more than one confident candidate) is left unmatched
-- for the owner to assign by hand on the Unmatched payments screen.
CREATE OR REPLACE FUNCTION public.match_incoming_transfer(p_transfer_id uuid)
RETURNS void
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
    RETURN;
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
  END IF;
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
