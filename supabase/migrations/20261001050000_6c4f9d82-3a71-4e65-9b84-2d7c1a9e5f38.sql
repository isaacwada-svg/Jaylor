-- PR O: Monthly business health report (Business and Custom plans, and
-- stores on trial). A clear monthly summary an owner can read themselves
-- and share a read-only, frozen copy of with a lender/investor/partner.
-- No lending features of any kind are built here -- this only produces and
-- shares a report.
--
-- Access rule, and why it's its own function rather than reusing
-- feature_usage('health_report') the way payroll/inventory do: a store on
-- trial is plan_code = 'growth' with trial_ends_at in the future (every
-- trialing store looks like this -- confirmed live: all 9 stores created
-- this month show plan_code 'growth' on the admin panel). feature_usage()
-- would read growth's own health_report flag (false, same as payroll's),
-- blocking trial stores entirely -- but this feature is explicitly meant to
-- be available during the trial regardless of the eventual plan, as a
-- reason to upgrade to Business. So every function below calls
-- has_health_report_access() directly instead. The boolean key is still
-- added to plans.limits, same pattern as payroll/inventory, for the data
-- model's own consistency and any future plan-comparison UI -- it is just
-- not what gates access to this feature's own functions.
--
-- Safe to run more than once.

BEGIN;

UPDATE public.plans SET limits = limits || jsonb_build_object('health_report', true)
WHERE code IN ('business', 'custom');
UPDATE public.plans SET limits = limits || jsonb_build_object('health_report', false)
WHERE code IN ('free', 'growth');

CREATE OR REPLACE FUNCTION public.has_health_report_access(p_store_id uuid)
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
REVOKE EXECUTE ON FUNCTION public.has_health_report_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_health_report_access(uuid) TO authenticated;

-- 1. report_shares / report_share_views. RLS enabled, no policies -- every
--    read/write is mediated by a SECURITY DEFINER function keyed by a
--    store id (owner/manager actions) or an unguessable token (the public
--    route), same posture as passport_shares/fitting_links. No raw IP
--    addresses are ever stored, per spec.
CREATE TABLE IF NOT EXISTS public.report_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  period_month text NOT NULL CHECK (period_month ~ '^\d{4}-\d{2}$'),
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  snapshot jsonb NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
ALTER TABLE public.report_shares ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS report_shares_store_id_idx ON public.report_shares(store_id);

CREATE TABLE IF NOT EXISTS public.report_share_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id uuid NOT NULL REFERENCES public.report_shares(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  user_agent text
);
ALTER TABLE public.report_share_views ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS report_share_views_share_id_idx ON public.report_share_views(share_id);

-- 2. Shared computation, called by both the owner/manager's live view and
--    create_report_share()'s frozen snapshot, so the two can never drift
--    apart. p_anonymize = false (the owner's own live view) returns real
--    client names; true (what gets stored in a share's snapshot, baked in
--    once at creation time) replaces them with "Client A", "Client B", ...
--    by descending billed amount, and drops client_id entirely so a
--    lender can never cross-reference a name back from the id.
--
--    "Outstanding at month end": order_balances (the live view the Reports
--    page reads) only ever reflects the current moment, which is correct
--    for the current month but wrong for any past month. This computes
--    the same balance definition (price minus non-voided payments) but
--    correctly scoped as of that month's end, so a past month's figure is
--    an accurate historical snapshot rather than today's live total. The
--    current month is still a running total as of now() -- the frontend
--    labels it "Month to date" rather than implying it's final.
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

  -- Money: billed (orders created this month), collected (non-voided
  -- payments this month), outstanding as of month end, average order
  -- value. Same definitions as the Reports page.
  SELECT coalesce(sum(price), 0), count(*), coalesce(sum(quantity), 0)
  INTO v_billed, v_orders_created, v_garments_created
  FROM public.orders
  WHERE store_id = p_store_id AND created_at >= v_month_start AND created_at < v_month_end;

  SELECT coalesce(sum(amount), 0) INTO v_collected
  FROM public.payments
  WHERE store_id = p_store_id AND voided = false
    AND paid_at >= v_month_start AND paid_at < v_month_end;

  SELECT coalesce(sum(greatest(o.price - coalesce(p.paid, 0), 0)), 0) INTO v_outstanding
  FROM public.orders o
  LEFT JOIN (
    SELECT order_id, sum(amount) AS paid
    FROM public.payments
    WHERE store_id = p_store_id AND voided = false AND paid_at < v_month_end
    GROUP BY order_id
  ) p ON p.order_id = o.id
  WHERE o.store_id = p_store_id AND o.created_at < v_month_end;

  -- Profit: order-level (price minus tailor-purchased materials, labour,
  -- other cost -- PR #10's own definition) for orders created this month,
  -- plus store expenses and net profit, exactly as the Reports page
  -- computes them (collected revenue minus expenses, not billed minus
  -- expenses).
  SELECT coalesce(sum(
    o.price - (
      coalesce((SELECT sum(m.cost) FROM public.order_materials m
                WHERE m.order_id = o.id AND m.source = 'tailor'), 0)
      + coalesce(o.labour_cost, 0) + coalesce(o.other_cost, 0)
    )
  ), 0) INTO v_order_profit
  FROM public.orders o
  WHERE o.store_id = p_store_id AND o.created_at >= v_month_start AND o.created_at < v_month_end;

  SELECT coalesce(sum(amount), 0) INTO v_expenses
  FROM public.expenses
  WHERE store_id = p_store_id AND spent_at >= v_month_start AND spent_at < v_month_end;

  v_net_profit := v_collected - v_expenses;

  -- Work: orders completed this month, on-time rate (reused verbatim via
  -- the store's existing rolling on-time score, same as the dashboard,
  -- storefront badge and Reports page), garments by type for the month.
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
    WHERE store_id = p_store_id AND created_at >= v_month_start AND created_at < v_month_end
    GROUP BY garment_type
  ) g;

  -- Clients: active this month (an order or a payment), repeat rate among
  -- them (more than one order ever -- not just this month), top 5 by
  -- amount billed this month.
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
    WHERE store_id = p_store_id AND created_at >= v_month_start AND created_at < v_month_end
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

  -- Trend: 6 months of billed vs collected, ending at the chosen month.
  -- Same definitions as the money figures above, reused instead of
  -- recomputed per month.
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
    WHERE store_id = p_store_id
      AND created_at >= (v_month_start - interval '5 months') AND created_at < v_month_end
    GROUP BY 1
  ) b ON b.month_start = m.month_start
  LEFT JOIN (
    SELECT date_trunc('month', paid_at) AS month_start, sum(amount) AS amount
    FROM public.payments
    WHERE store_id = p_store_id AND voided = false
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
      'net_profit', v_net_profit
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
    'trend', v_trend
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public._compute_health_report(uuid, text, boolean) FROM PUBLIC, anon, authenticated;

-- 3. Owner/manager live view -- real client names, current figures.
CREATE OR REPLACE FUNCTION public.get_business_health_report(p_store_id uuid, p_period_month text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_store_role(p_store_id, ARRAY['owner'::store_role, 'manager'::store_role]) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_health_report_access(p_store_id) THEN
    RAISE EXCEPTION 'Not available on this plan' USING ERRCODE = '42501';
  END IF;

  RETURN public._compute_health_report(p_store_id, p_period_month, false);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_business_health_report(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_business_health_report(uuid, text) TO authenticated;

-- 4. Owner-only: create a share link. Freezes the report at this moment
--    (anonymized) into `snapshot`, so a lender's view never changes while
--    new orders/payments are added afterward.
CREATE OR REPLACE FUNCTION public.create_report_share(
  p_store_id uuid,
  p_period_month text,
  p_expires_days int DEFAULT 7
)
RETURNS public.report_shares
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot jsonb;
  v_row public.report_shares%ROWTYPE;
BEGIN
  IF NOT public.has_store_role(p_store_id, ARRAY['owner'::store_role]) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_health_report_access(p_store_id) THEN
    RAISE EXCEPTION 'Not available on this plan' USING ERRCODE = '42501';
  END IF;
  IF p_expires_days NOT IN (1, 7, 30) THEN
    RAISE EXCEPTION 'Invalid expiry' USING ERRCODE = '22023';
  END IF;

  v_snapshot := public._compute_health_report(p_store_id, p_period_month, true);

  INSERT INTO public.report_shares (store_id, period_month, snapshot, created_by, expires_at)
  VALUES (p_store_id, p_period_month, v_snapshot, auth.uid(), now() + make_interval(days => p_expires_days))
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_report_share(uuid, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_report_share(uuid, text, int) TO authenticated;

-- 5. Owner-only: list this store's share links with view counts, for the
--    "active links" screen.
CREATE OR REPLACE FUNCTION public.list_report_shares(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shares jsonb;
BEGIN
  IF NOT public.has_store_role(p_store_id, ARRAY['owner'::store_role]) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', rs.id,
    'period_month', rs.period_month,
    'token', rs.token,
    'created_at', rs.created_at,
    'expires_at', rs.expires_at,
    'revoked_at', rs.revoked_at,
    'view_count', (SELECT count(*) FROM public.report_share_views v WHERE v.share_id = rs.id)
  ) ORDER BY rs.created_at DESC), '[]'::jsonb)
  INTO v_shares
  FROM public.report_shares rs
  WHERE rs.store_id = p_store_id;

  RETURN v_shares;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.list_report_shares(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_report_shares(uuid) TO authenticated;

-- 6. Owner-only: revoke a share link. Stops it from ever serving data
--    again -- does not delete the row, so it still shows in the list.
CREATE OR REPLACE FUNCTION public.revoke_report_share(p_store_id uuid, p_share_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_store_role(p_store_id, ARRAY['owner'::store_role]) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.report_shares
  SET revoked_at = now()
  WHERE id = p_share_id AND store_id = p_store_id AND revoked_at IS NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.revoke_report_share(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_report_share(uuid, uuid) TO authenticated;

-- 7. Public, anon-callable: the read-only /r/$token route. Never returns
--    the snapshot for an expired or revoked link -- only a status string.
--    Logs a view (timestamp + user agent only, never an IP address).
CREATE OR REPLACE FUNCTION public.get_report_share(p_token uuid, p_user_agent text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_share public.report_shares%ROWTYPE;
BEGIN
  SELECT * INTO v_share FROM public.report_shares WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  IF v_share.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'revoked');
  END IF;
  IF v_share.expires_at <= now() THEN
    RETURN jsonb_build_object('status', 'expired');
  END IF;

  INSERT INTO public.report_share_views (share_id, user_agent)
  VALUES (v_share.id, left(p_user_agent, 500));

  RETURN jsonb_build_object('status', 'available', 'report', v_share.snapshot);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_report_share(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_report_share(uuid, text) TO anon, authenticated;

COMMIT;

-- Verification: expect every row true, failed_checks empty.
SELECT
  bool_and(ok) AS all_true,
  coalesce(array_agg(check_name) FILTER (WHERE NOT ok), ARRAY[]::text[]) AS failed_checks
FROM (
  SELECT 'health_report flag on plans' AS check_name,
    bool_and(limits ? 'health_report') AS ok
  FROM public.plans
  UNION ALL
  SELECT 'health_report true for business/custom',
    bool_and((limits ->> 'health_report')::boolean)
  FROM public.plans WHERE code IN ('business', 'custom')
  UNION ALL
  SELECT 'health_report false for free/growth',
    bool_and(NOT (limits ->> 'health_report')::boolean)
  FROM public.plans WHERE code IN ('free', 'growth')
  UNION ALL
  SELECT 'report_shares table exists', to_regclass('public.report_shares') IS NOT NULL
  UNION ALL
  SELECT 'report_share_views table exists', to_regclass('public.report_share_views') IS NOT NULL
  UNION ALL
  SELECT 'functions exist', (
    SELECT count(*) = 6 FROM pg_proc
    WHERE proname IN (
      'has_health_report_access', 'get_business_health_report', 'create_report_share',
      'list_report_shares', 'revoke_report_share', 'get_report_share'
    )
  )
  UNION ALL
  SELECT 'anon can call get_report_share', has_function_privilege(
    'anon', 'public.get_report_share(uuid, text)', 'execute'
  )
  UNION ALL
  SELECT 'anon cannot call create_report_share', NOT has_function_privilege(
    'anon', 'public.create_report_share(uuid, text, int)', 'execute'
  )
) checks;
