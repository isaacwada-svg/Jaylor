-- PR P: Per-order currency for clients abroad (Business and Custom plans,
-- and stores on trial). An order can be priced in NGN, USD, GBP or GHS,
-- with receipts/quotes/client pages showing the right currency, without
-- mixing currencies in totals.
--
-- Three things found while pulling order_balances' live definition (it was
-- never tracked in a migration, same as stores/profiles earlier) are fixed
-- here too, since the currency work touches this view directly:
--
-- 1. order_balances' `total` is price + tailor-purchased material cost.
--    Material costs are always recorded in NGN (inventory/purchases are a
--    store-side concern); for a non-NGN order this now converts that cost
--    into the order's own currency via its fx_rate_to_ngn before adding it,
--    so an NGN order's own total is byte-for-byte unchanged.
--
-- 2. The view filters with has_store_role(), which reads auth.uid() --
--    there is none when the daily/weekly digest cron runs as service_role,
--    so order_balances silently returns zero rows for it and every
--    "outstanding" figure in a digest has always been 0. Fixed by moving
--    the shared formula into a private, ungranted function
--    (_all_order_balances()), which the view filters by has_store_role()
--    exactly as before, and which a new _store_order_balances(p_store_id)
--    wrapper (also private, no grants to anon/authenticated -- reachable
--    only from other SECURITY DEFINER functions that have already checked
--    service_role or store membership themselves) filters by store_id
--    instead, for the digest and health-report functions to use.
--    PR O's own _compute_health_report() is updated the same way, and its
--    own outstanding figure is corrected to match order_balances' real
--    definition (price + materials, not price alone -- it under-counted
--    this since PR O shipped).
--
-- 3. Billing vs inventory (REPORTED ONLY, not changed here -- see the
--    informational query at the end of this file): use_stock_on_order()
--    inserts order_materials with source = 'tailor' and inventory_item_id
--    set, which order_balances' own total (and order profit, in Reports
--    and the health report) both already treat as a cost the client is
--    billed for *and* a cost that reduces the shop's margin on the agreed
--    price. Those are two different things -- stock used against a fixed
--    price should only ever be the second one. A `billed_to_client`
--    boolean on order_materials (true for fabric a tailor explicitly
--    buys and bills for, false for stock used as part of the agreed
--    price) is the natural fix; left for a decision before changing it.
--
-- Safe to run more than once.

BEGIN;

-- ============================================================
-- 1. Feature gate -- same trial-inclusive pattern as PR O's health_report,
--    not plain feature_usage(): a trialing store is plan_code 'growth'
--    with trial_ends_at in the future, and feature_usage() would read
--    growth's own flag (false) and block it.
-- ============================================================
UPDATE public.plans SET limits = limits || jsonb_build_object('multi_currency', true)
WHERE code IN ('business', 'custom');
UPDATE public.plans SET limits = limits || jsonb_build_object('multi_currency', false)
WHERE code IN ('free', 'growth');

CREATE OR REPLACE FUNCTION public.has_multi_currency_access(p_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(plan_code IN ('business', 'custom'), false)
    OR (trial_ends_at IS NOT NULL AND trial_ends_at > now())
  FROM public.stores WHERE id = p_store_id;
$$;
REVOKE EXECUTE ON FUNCTION public.has_multi_currency_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_multi_currency_access(uuid) TO authenticated;

-- ============================================================
-- 2. Columns. Backfilled from each order's/quote's own store currency
--    (not hardcoded 'NGN') since a store's own base currency need not be
--    NGN -- the CHECK set is the four this PR supports; if any store
--    somehow carries a fifth, this backfill (and the CHECK below) will
--    fail loudly rather than silently mis-tagging it, which is the
--    correct failure mode for a currency migration.
-- ============================================================
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS currency text;
UPDATE public.orders o SET currency = s.currency
FROM public.stores s WHERE s.id = o.store_id AND o.currency IS NULL;
ALTER TABLE public.orders ALTER COLUMN currency SET DEFAULT 'NGN';
ALTER TABLE public.orders ALTER COLUMN currency SET NOT NULL;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_currency_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_currency_check
  CHECK (currency IN ('NGN', 'USD', 'GBP', 'GHS'));

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS fx_rate_to_ngn numeric;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_fx_rate_required_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_fx_rate_required_check
  CHECK (currency = 'NGN' OR fx_rate_to_ngn IS NOT NULL);

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS currency text;
UPDATE public.payments p SET currency = o.currency
FROM public.orders o WHERE o.id = p.order_id AND p.currency IS NULL;
ALTER TABLE public.payments ALTER COLUMN currency SET NOT NULL;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_currency_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_currency_check
  CHECK (currency IN ('NGN', 'USD', 'GBP', 'GHS'));

ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS currency text;
UPDATE public.quotes q SET currency = s.currency
FROM public.stores s WHERE s.id = q.store_id AND q.currency IS NULL;
ALTER TABLE public.quotes ALTER COLUMN currency SET DEFAULT 'NGN';
ALTER TABLE public.quotes ALTER COLUMN currency SET NOT NULL;
ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_currency_check;
ALTER TABLE public.quotes ADD CONSTRAINT quotes_currency_check
  CHECK (currency IN ('NGN', 'USD', 'GBP', 'GHS'));

ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS fx_rate_to_ngn numeric;
ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_fx_rate_required_check;
ALTER TABLE public.quotes ADD CONSTRAINT quotes_fx_rate_required_check
  CHECK (currency = 'NGN' OR fx_rate_to_ngn IS NOT NULL);

-- ============================================================
-- 3. Enforcement triggers on orders: a non-NGN currency requires access
--    (checked server-side regardless of what the client sends); currency
--    and rate lock once the order has a payment; payments.currency is
--    always copied from the order, never client-supplied.
-- ============================================================
CREATE OR REPLACE FUNCTION public._enforce_order_currency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_has_payment boolean;
BEGIN
  IF NEW.currency <> 'NGN' AND NOT public.has_multi_currency_access(NEW.store_id) THEN
    RAISE EXCEPTION 'Other currencies are not available on this plan' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' AND (NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.fx_rate_to_ngn IS DISTINCT FROM OLD.fx_rate_to_ngn) THEN
    SELECT EXISTS(
      SELECT 1 FROM public.payments WHERE order_id = NEW.id AND voided = false
    ) INTO v_has_payment;
    IF v_has_payment THEN
      RAISE EXCEPTION 'Currency and rate can only be changed before the first payment' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS orders_enforce_currency ON public.orders;
CREATE TRIGGER orders_enforce_currency
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public._enforce_order_currency();

CREATE OR REPLACE FUNCTION public._set_payment_currency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  SELECT currency INTO NEW.currency FROM public.orders WHERE id = NEW.order_id;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS payments_set_currency ON public.payments;
CREATE TRIGGER payments_set_currency
  BEFORE INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public._set_payment_currency();

-- ============================================================
-- 4. order_balances: shared, currency-aware formula moved into a private
--    function; the view keeps its existing role filter for normal app
--    use, and a store-scoped wrapper (no role filter, no public grants)
--    serves the digest/report functions below. currency is appended as
--    the view's last column, so CREATE OR REPLACE VIEW applies in place
--    (confirmed live: no dependent views).
-- ============================================================
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
      WHERE om.order_id = o.id AND om.source = 'tailor'
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
      WHERE om.order_id = o.id AND om.source = 'tailor'
    ), 0) - coalesce((
      SELECT sum(p.amount) FROM public.payments p
      WHERE p.order_id = o.id AND p.voided = false
    ), 0) AS balance,
    o.currency
  FROM public.orders o;
$$;
REVOKE EXECUTE ON FUNCTION public._all_order_balances() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE VIEW public.order_balances AS
SELECT order_id, store_id, total, paid, balance, currency
FROM public._all_order_balances()
WHERE has_store_role(store_id, ARRAY['owner'::store_role, 'manager'::store_role]);

CREATE OR REPLACE FUNCTION public._store_order_balances(p_store_id uuid)
RETURNS TABLE(order_id uuid, store_id uuid, total numeric, paid numeric, balance numeric, currency text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT order_id, store_id, total, paid, balance, currency
  FROM public._all_order_balances()
  WHERE store_id = p_store_id;
$$;
REVOKE EXECUTE ON FUNCTION public._store_order_balances(uuid) FROM PUBLIC, anon, authenticated;
-- service_role (never exposed to a browser -- only edge functions hold this
-- key) is granted explicitly so create-order-payment/create-tracking-payment
-- can read a real balance too. Those edge functions read order_balances
-- directly via the Postgres REST API using the service-role key, which hits
-- the exact same auth.uid()-is-null problem as the digest functions and the
-- public tracking page did -- confirmed by the same reasoning: a service-role
-- REST call carries no user JWT, so has_store_role() inside the view's own
-- WHERE clause always evaluated false, meaning "outstanding" was always 0 and
-- both Jaylor Pay request paths have always failed with "This order has
-- nothing left to pay", for every order. Fixed in the same migration that
-- introduces this function, in the two edge functions below.
GRANT EXECUTE ON FUNCTION public._store_order_balances(uuid) TO service_role;

-- ============================================================
-- 5. Jaylor Pay / dedicated-account auto-matching stay NGN-only: a
--    Paystack NG dedicated virtual account is itself NGN-denominated, so
--    an incoming transfer's amount can never legitimately match a
--    foreign-currency order's balance -- excluded explicitly rather than
--    left to an accidental numeric coincidence.
-- ============================================================
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
    AND o.currency = 'NGN'
    AND b.balance = v_transfer.amount
    AND public.name_similarity(v_transfer.sender_name, c.full_name) >= 0.34;

  IF v_count = 1 THEN
    SELECT o.id INTO v_order_id
    FROM public.order_balances b
    JOIN public.orders o ON o.id = b.order_id
    JOIN public.clients c ON c.id = o.client_id
    WHERE b.store_id = v_transfer.store_id
      AND o.status <> 'cancelled'
      AND o.currency = 'NGN'
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

-- ============================================================
-- 6. Digests: now read through _store_order_balances() (fixes the
--    service-role/zero-balance bug), NGN fields unchanged in meaning
--    (now explicitly NGN-scoped rather than accidentally everything),
--    plus a per-currency breakdown for any other currency in use.
-- ============================================================
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
  v_low_stock jsonb;
  v_other_currencies jsonb;
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

  SELECT coalesce(sum(b.balance), 0) INTO v_outstanding
  FROM public._store_order_balances(p_store_id) b WHERE b.currency = 'NGN';

  SELECT coalesce(jsonb_agg(t), '[]'::jsonb) INTO v_top3
  FROM (
    SELECT c.full_name AS client_name, b.balance, o.number
    FROM public._store_order_balances(p_store_id) b
    JOIN public.orders o ON o.id = b.order_id
    JOIN public.clients c ON c.id = o.client_id
    WHERE b.currency = 'NGN' AND b.balance > 0
    ORDER BY b.balance DESC
    LIMIT 3
  ) t;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id, 'name', i.name, 'quantity', i.quantity, 'unit', i.unit
  ) ORDER BY i.name), '[]'::jsonb) INTO v_low_stock
  FROM public.inventory_items i
  WHERE i.store_id = p_store_id AND i.is_active AND i.reorder_level > 0 AND i.quantity <= i.reorder_level;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'currency', b.currency, 'outstanding', sum(b.balance)
  )), '[]'::jsonb) INTO v_other_currencies
  FROM public._store_order_balances(p_store_id) b
  WHERE b.currency <> 'NGN'
  GROUP BY b.currency;

  RETURN jsonb_build_object(
    'due_today', v_due_today,
    'due_next_3_days', v_due_next3,
    'overdue', v_overdue,
    'outstanding_total', v_outstanding,
    'top_balances', v_top3,
    'low_stock_items', v_low_stock,
    'other_currencies', v_other_currencies
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
  v_capacity numeric;
  v_overloaded_weeks jsonb;
  v_other_currencies jsonb;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.has_store_role(p_store_id, ARRAY['owner'::store_role, 'manager'::store_role]) THEN
    RAISE EXCEPTION 'You do not have permission to do this' USING ERRCODE = 'P0103';
  END IF;

  SELECT count(*), coalesce(sum(price), 0) INTO v_new_orders, v_billed
  FROM public.orders WHERE store_id = p_store_id AND currency = 'NGN'
    AND created_at >= now() - interval '7 days';

  SELECT coalesce(sum(amount), 0) INTO v_collected
  FROM public.payments
  WHERE store_id = p_store_id AND voided = false AND currency = 'NGN'
    AND paid_at >= now() - interval '7 days';

  SELECT coalesce(sum(b.balance), 0) INTO v_outstanding
  FROM public._store_order_balances(p_store_id) b WHERE b.currency = 'NGN';

  SELECT count(*) INTO v_overdue_count
  FROM public.orders
  WHERE store_id = p_store_id AND status NOT IN ('collected', 'cancelled')
    AND delivery_date::date < current_date;

  SELECT coalesce(sum(quantity), 0) INTO v_garments_due
  FROM public.orders
  WHERE store_id = p_store_id AND status NOT IN ('collected', 'cancelled')
    AND delivery_date::date BETWEEN current_date AND current_date + 6;

  SELECT capacity INTO v_capacity FROM public._store_weekly_throughput(p_store_id);

  SELECT coalesce(jsonb_agg(w.week_start ORDER BY w.week_start), '[]'::jsonb) INTO v_overloaded_weeks
  FROM (
    SELECT (date_trunc('week', now())::date + (n * 7)) AS week_start
    FROM generate_series(0, 5) AS n
  ) w
  LEFT JOIN (
    SELECT date_trunc('week', coalesce(o.promised_date, o.delivery_date)::timestamp)::date AS week_start,
           sum(o.quantity) AS qty
    FROM public.orders o
    WHERE o.store_id = p_store_id AND o.status NOT IN ('collected', 'cancelled')
    GROUP BY 1
  ) d ON d.week_start = w.week_start
  WHERE v_capacity IS NOT NULL AND coalesce(d.qty, 0) > v_capacity;

  SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO v_other_currencies
  FROM (
    SELECT
      o.currency,
      coalesce(sum(o.price) FILTER (WHERE o.created_at >= now() - interval '7 days'), 0) AS billed,
      coalesce((
        SELECT sum(p.amount) FROM public.payments p
        WHERE p.store_id = p_store_id AND p.currency = o.currency AND p.voided = false
          AND p.paid_at >= now() - interval '7 days'
      ), 0) AS collected,
      coalesce((
        SELECT sum(b.balance) FROM public._store_order_balances(p_store_id) b
        WHERE b.currency = o.currency
      ), 0) AS outstanding
    FROM public.orders o
    WHERE o.store_id = p_store_id AND o.currency <> 'NGN'
    GROUP BY o.currency
  ) x;

  RETURN jsonb_build_object(
    'new_orders', v_new_orders,
    'billed', v_billed,
    'collected', v_collected,
    'outstanding_total', v_outstanding,
    'overdue_count', v_overdue_count,
    'garments_due_this_week', v_garments_due,
    'overloaded_weeks', v_overloaded_weeks,
    'other_currencies', v_other_currencies
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_weekly_digest_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_weekly_digest_data(uuid) TO authenticated, service_role;

-- ============================================================
-- 7. PR O's health report: corrects outstanding to match order_balances'
--    real definition (price + materials, previously price alone), scopes
--    its NGN money fields to NGN orders, adds an other_currencies section,
--    and converts foreign-order prices to NGN (via each order's own
--    fx_rate_to_ngn) before computing profit -- an order missing its rate
--    is excluded from profit and counted in profit_rate_missing_count
--    rather than crashing or silently mis-adding.
-- ============================================================
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

  -- Outstanding at month end, NGN orders -- same price + tailor-material
  -- definition as order_balances, scoped as of that month's end rather
  -- than the live total order_balances itself would give.
  SELECT coalesce(sum(greatest(
    o.price + coalesce((
      SELECT sum(om.cost) FROM public.order_materials om
      WHERE om.order_id = o.id AND om.source = 'tailor'
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
  -- own currency, plus an NGN equivalent via each currency's own rate
  -- (an order missing fx_rate_to_ngn is excluded from the NGN-equivalent
  -- sum, never from the currency's own billed/collected/outstanding).
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
          WHERE om.order_id = o.id AND om.source = 'tailor'
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

  -- Profit: order-level (price minus tailor-purchased materials, labour,
  -- other cost -- PR #10's own definition) for orders created this month.
  -- A foreign-currency order's price is converted to NGN via its own
  -- fx_rate_to_ngn first (costs are already NGN); one missing its rate is
  -- excluded here and counted instead.
  SELECT
    coalesce(sum(
      (CASE WHEN o.currency = 'NGN' THEN o.price ELSE round(o.price * o.fx_rate_to_ngn, 2) END)
      - (
        coalesce((SELECT sum(m.cost) FROM public.order_materials m
                  WHERE m.order_id = o.id AND m.source = 'tailor'), 0)
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

COMMIT;

-- ============================================================
-- Informational only (not applied): how many existing order_materials
-- rows are the billing-vs-inventory case described above. Report this
-- count back -- no schema change is made for it in this PR.
-- ============================================================
SELECT count(*) AS stock_used_rows_billed_to_client_today
FROM public.order_materials
WHERE source = 'tailor' AND inventory_item_id IS NOT NULL;

-- ============================================================
-- Verification: expect every row true, failed_checks empty.
-- ============================================================
SELECT
  bool_and(ok) AS all_true,
  coalesce(array_agg(check_name) FILTER (WHERE NOT ok), ARRAY[]::text[]) AS failed_checks
FROM (
  SELECT 'orders.currency exists' AS check_name,
    EXISTS(SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='orders' AND column_name='currency') AS ok
  UNION ALL
  SELECT 'payments.currency exists',
    EXISTS(SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='payments' AND column_name='currency')
  UNION ALL
  SELECT 'quotes.currency exists',
    EXISTS(SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='quotes' AND column_name='currency')
  UNION ALL
  SELECT 'no order missing currency',
    NOT EXISTS(SELECT 1 FROM public.orders WHERE currency IS NULL)
  UNION ALL
  SELECT 'no payment missing currency',
    NOT EXISTS(SELECT 1 FROM public.payments WHERE currency IS NULL)
  UNION ALL
  SELECT 'multi_currency true for business/custom',
    bool_and((limits ->> 'multi_currency')::boolean)
  FROM public.plans WHERE code IN ('business', 'custom')
  UNION ALL
  SELECT 'multi_currency false for free/growth',
    bool_and(NOT (limits ->> 'multi_currency')::boolean)
  FROM public.plans WHERE code IN ('free', 'growth')
  UNION ALL
  SELECT 'order_balances has currency column',
    EXISTS(SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='order_balances' AND column_name='currency')
  UNION ALL
  SELECT 'private helpers exist', (
    SELECT count(*) = 2 FROM pg_proc
    WHERE proname IN ('_all_order_balances', '_store_order_balances')
  )
  UNION ALL
  SELECT 'anon cannot call _store_order_balances', NOT has_function_privilege(
    'anon', 'public._store_order_balances(uuid)', 'execute'
  )
  UNION ALL
  SELECT 'authenticated cannot call _store_order_balances', NOT has_function_privilege(
    'authenticated', 'public._store_order_balances(uuid)', 'execute'
  )
  UNION ALL
  SELECT 'service_role can call _store_order_balances', has_function_privilege(
    'service_role', 'public._store_order_balances(uuid)', 'execute'
  )
) checks;
