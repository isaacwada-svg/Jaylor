-- PR P2: order_materials.billed_to_client -- distinguishes a tailor-purchased
-- material the shop bills the client for (added to their total; pass-through
-- in profit, since it's added to both the client's total and the shop's own
-- cost) from one used as part of the agreed price (a true cost, not billed).
--
-- Reported in PR P (finding #2): use_stock_on_order() made every stock-used
-- material both bill the client *and* reduce profit for the same cost --
-- inconsistent. This lets the owner/manager mark each tailor-purchased
-- material explicitly, with sensible defaults: new stock use defaults to
-- NOT billed (the common case -- using stock as part of the price already
-- agreed), new manually-entered tailor-purchased fabric defaults to billed
-- (the common case -- fabric bought specifically for this order).
--
-- Safe to run more than once.

BEGIN;

-- 1. Column + backfill. Nullable first so the backfill can run, then
--    defaulted and required. Existing rows keep today's balances exactly:
--    true (billed) for every source = 'tailor' row -- the only source
--    order_balances' own total ever added -- false otherwise.
ALTER TABLE public.order_materials ADD COLUMN IF NOT EXISTS billed_to_client boolean;
UPDATE public.order_materials SET billed_to_client = (source = 'tailor') WHERE billed_to_client IS NULL;
ALTER TABLE public.order_materials ALTER COLUMN billed_to_client SET DEFAULT true;
ALTER TABLE public.order_materials ALTER COLUMN billed_to_client SET NOT NULL;

-- 2. use_stock_on_order (PR G): stock used on an order now defaults to NOT
--    billed to the client. Unchanged otherwise.
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

-- 3. Owner/manager only, while the order is not yet collected. Only a
--    tailor-purchased material can be billed to the client -- client-
--    supplied fabric was never a cost to begin with.
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

-- 4. order_balances: total/balance now add only billed_to_client materials
--    (still currency-converted as PR P already does). billed_to_client is
--    the authoritative flag now -- it subsumes the old source = 'tailor'
--    filter, since a customer-supplied row is always backfilled to false
--    and can never be set to true (enforced above).
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

-- 5. Health report: outstanding (both NGN and other-currencies) follows the
--    same billed_to_client rule as order_balances; order profit now treats
--    a billed material as pass-through (no effect either way, since it's
--    added to the client's total via order_balances) and only an unbilled
--    one as a true cost -- the inconsistency PR P reported.
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
  -- (it's already added to the client's own total via order_balances, so it
  -- neither helps nor hurts profit here); only an unbilled one is a true
  -- cost. A foreign-currency order's price is converted to NGN via its own
  -- fx_rate_to_ngn first (costs are already NGN); one missing its rate is
  -- excluded here and counted instead.
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

COMMIT;

-- ============================================================
-- Verification: expect every row true, failed_checks empty.
-- ============================================================
SELECT
  bool_and(ok) AS all_true,
  coalesce(array_agg(check_name) FILTER (WHERE NOT ok), ARRAY[]::text[]) AS failed_checks
FROM (
  SELECT 'order_materials.billed_to_client exists' AS check_name,
    EXISTS(SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='order_materials' AND column_name='billed_to_client') AS ok
  UNION ALL
  SELECT 'no material missing billed_to_client',
    NOT EXISTS(SELECT 1 FROM public.order_materials WHERE billed_to_client IS NULL)
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
  SELECT 'use_stock_on_order inserts billed_to_client',
    (pg_get_functiondef('public.use_stock_on_order(uuid,uuid,numeric,text)'::regprocedure) ILIKE '%billed_to_client%')
  UNION ALL
  SELECT '_all_order_balances uses billed_to_client',
    (pg_get_functiondef('public._all_order_balances()'::regprocedure) ILIKE '%billed_to_client%')
  UNION ALL
  SELECT '_compute_health_report uses billed_to_client',
    (pg_get_functiondef('public._compute_health_report(uuid,text,boolean)'::regprocedure) ILIKE '%billed_to_client%')
) checks;
