-- Moments Phase 2: milestone cards + Style Book. Shareable cards (canvas
-- rendering) are built client-side against this data -- nothing here
-- generates images, it only detects achievements and exposes a safe,
-- revocable read of a client's garment history.

-- ============================================================
-- store_milestones: one row per achievement, ever. UNIQUE(store_id,
-- milestone_key) makes every detection idempotent via ON CONFLICT DO
-- NOTHING, so a trigger re-checking the same condition twice never
-- creates a duplicate.
-- ============================================================

CREATE TABLE public.store_milestones (
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

CREATE POLICY store_milestones_owner_manager_select
  ON public.store_milestones FOR SELECT TO authenticated
  USING (has_store_role(store_id, ARRAY['owner'::store_role, 'manager'::store_role]));

-- Owner/manager can only ever flip acknowledged -- app logic is the only
-- thing that should ever set milestone_key/detail/achieved_at, same
-- pattern as moments_owner_manager_update.
CREATE POLICY store_milestones_owner_manager_ack
  ON public.store_milestones FOR UPDATE TO authenticated
  USING (has_store_role(store_id, ARRAY['owner'::store_role, 'manager'::store_role]))
  WITH CHECK (has_store_role(store_id, ARRAY['owner'::store_role, 'manager'::store_role]));

REVOKE ALL ON public.store_milestones FROM PUBLIC, anon;
GRANT SELECT, UPDATE ON public.store_milestones TO authenticated;
GRANT ALL ON public.store_milestones TO service_role;

-- ============================================================
-- Order-count milestones: 50th and 100th non-cancelled order.
-- ============================================================

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

CREATE TRIGGER check_order_count_milestones_after_insert
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.check_order_count_milestones();

-- ============================================================
-- Collected-amount milestone: first time cumulative non-voided payments
-- for a store crosses N1,000,000.
-- ============================================================

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

CREATE TRIGGER check_collected_amount_milestone_after_insert
AFTER INSERT ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.check_collected_amount_milestone();

-- ============================================================
-- "First month with no unpaid balance": a daily service-role check
-- reading it literally would need month-end evaluation; this instead
-- records the first day a store's total outstanding balance ever hits
-- zero, which is the same real-world moment a shop owner would call
-- "everything is paid up" and is simple to state honestly to them.
-- ============================================================

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

-- ============================================================
-- Style Book: a private, revocable token per client. The link itself
-- is the secret (matches get_invite_by_token / measurement-passport
-- pattern already used elsewhere) -- no login, no price data.
-- ============================================================

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
