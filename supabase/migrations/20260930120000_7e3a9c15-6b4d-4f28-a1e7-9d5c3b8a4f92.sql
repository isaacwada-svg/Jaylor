-- Step 3.4: capacity warning on delivery dates (Growth and above).
--
-- Weekly throughput = average sum(quantity) of orders reaching "ready" per
-- week over the last 8 weeks (order_status_history). Below 4 weeks of
-- history, falls back to a manual estimate (store_settings.
-- weekly_capacity_estimate). Everything here is computed on demand --
-- Lovable Cloud has no pg_cron, so there is no scheduled job. Safe to run
-- more than once.

BEGIN;

-- 1. Manual fallback estimate, used until 4 weeks of real throughput exist.
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS weekly_capacity_estimate integer
    CHECK (weekly_capacity_estimate IS NULL OR weekly_capacity_estimate > 0);

-- 2. Private helper (no grants -- reachable only from other SECURITY
--    DEFINER functions in this file). "measured" once at least 4 of the
--    last 8 weeks had an order reach ready; otherwise "estimate" (the
--    manual figure, if set) or "none" (capacity unknown).
CREATE OR REPLACE FUNCTION public._store_weekly_throughput(p_store_id uuid)
RETURNS TABLE(capacity numeric, source text, weeks_of_data int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_avg numeric;
  v_week_count int;
  v_estimate integer;
BEGIN
  SELECT avg(qty), count(*) INTO v_avg, v_week_count
  FROM (
    SELECT date_trunc('week', h.changed_at)::date AS week_start, sum(o.quantity) AS qty
    FROM public.order_status_history h
    JOIN public.orders o ON o.id = h.order_id
    WHERE h.to_status = 'ready'
      AND o.store_id = p_store_id
      AND h.changed_at >= now() - interval '8 weeks'
    GROUP BY 1
  ) weekly;

  IF coalesce(v_week_count, 0) >= 4 THEN
    RETURN QUERY SELECT v_avg, 'measured'::text, v_week_count;
    RETURN;
  END IF;

  SELECT weekly_capacity_estimate INTO v_estimate
  FROM public.store_settings WHERE store_id = p_store_id;

  IF v_estimate IS NOT NULL THEN
    RETURN QUERY SELECT v_estimate::numeric, 'estimate'::text, coalesce(v_week_count, 0);
  ELSE
    RETURN QUERY SELECT NULL::numeric, 'none'::text, coalesce(v_week_count, 0);
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._store_weekly_throughput(uuid) FROM PUBLIC, anon, authenticated;

-- 3. Dashboard's 6-week load chart. Garments due are grouped by the week of
--    coalesce(promised_date, delivery_date) -- promised_date is the
--    shop's committed date (Step 3.2); delivery_date only fills in for the
--    rare pre-Step-3.2 order that somehow still lacks one.
CREATE OR REPLACE FUNCTION public.get_store_capacity_forecast(p_store_id uuid, p_weeks int DEFAULT 6)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_capacity numeric;
  v_source text;
  v_weeks_of_data int;
  v_weeks jsonb;
BEGIN
  IF NOT public.is_store_member(p_store_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_weeks < 1 OR p_weeks > 26 THEN
    RAISE EXCEPTION 'p_weeks out of range' USING ERRCODE = 'P0105';
  END IF;

  SELECT capacity, source, weeks_of_data INTO v_capacity, v_source, v_weeks_of_data
  FROM public._store_weekly_throughput(p_store_id);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'week_start', w.week_start,
    'garments_due', coalesce(d.qty, 0),
    'capacity', v_capacity,
    'overloaded', v_capacity IS NOT NULL AND coalesce(d.qty, 0) > v_capacity
  ) ORDER BY w.week_start), '[]'::jsonb) INTO v_weeks
  FROM (
    SELECT (date_trunc('week', now())::date + (n * 7)) AS week_start
    FROM generate_series(0, p_weeks - 1) AS n
  ) w
  LEFT JOIN (
    SELECT date_trunc('week', coalesce(o.promised_date, o.delivery_date)::timestamp)::date AS week_start,
           sum(o.quantity) AS qty
    FROM public.orders o
    WHERE o.store_id = p_store_id
      AND o.status NOT IN ('collected', 'cancelled')
      AND coalesce(o.promised_date, o.delivery_date) IS NOT NULL
    GROUP BY 1
  ) d ON d.week_start = w.week_start;

  RETURN jsonb_build_object(
    'capacity', v_capacity,
    'capacity_source', v_source,
    'weeks_of_data', v_weeks_of_data,
    'weeks', v_weeks
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_store_capacity_forecast(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_store_capacity_forecast(uuid, int) TO authenticated;

-- 4. Single-date check for the order form/edit: that week's load, and (when
--    over capacity) the earliest week in the next 12 with room. Never
--    blocks the save -- the caller only shows a warning.
CREATE OR REPLACE FUNCTION public.get_order_capacity_check(p_store_id uuid, p_date date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_capacity numeric;
  v_source text;
  v_weeks_of_data int;
  v_week_start date := date_trunc('week', p_date::timestamp)::date;
  v_garments_due int;
  v_overloaded boolean;
  v_suggested_week date;
BEGIN
  IF NOT public.is_store_member(p_store_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT capacity, source, weeks_of_data INTO v_capacity, v_source, v_weeks_of_data
  FROM public._store_weekly_throughput(p_store_id);

  SELECT coalesce(sum(o.quantity), 0) INTO v_garments_due
  FROM public.orders o
  WHERE o.store_id = p_store_id
    AND o.status NOT IN ('collected', 'cancelled')
    AND date_trunc('week', coalesce(o.promised_date, o.delivery_date)::timestamp)::date = v_week_start;

  v_overloaded := v_capacity IS NOT NULL AND v_garments_due > v_capacity;

  IF v_overloaded THEN
    SELECT w.week_start INTO v_suggested_week
    FROM (
      SELECT (v_week_start + (n * 7)) AS week_start
      FROM generate_series(1, 12) AS n
    ) w
    LEFT JOIN (
      SELECT date_trunc('week', coalesce(o.promised_date, o.delivery_date)::timestamp)::date AS week_start,
             sum(o.quantity) AS qty
      FROM public.orders o
      WHERE o.store_id = p_store_id AND o.status NOT IN ('collected', 'cancelled')
      GROUP BY 1
    ) d ON d.week_start = w.week_start
    WHERE coalesce(d.qty, 0) <= v_capacity
    ORDER BY w.week_start
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'week_start', v_week_start,
    'garments_due', v_garments_due,
    'capacity', v_capacity,
    'capacity_source', v_source,
    'overloaded', coalesce(v_overloaded, false),
    'suggested_week', v_suggested_week
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_order_capacity_check(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_order_capacity_check(uuid, date) TO authenticated;

-- 5. get_weekly_digest_data -- adds overloaded_weeks (next 6 weeks, same
--    horizon as the dashboard chart), every existing field unchanged. Uses
--    the private helper directly (not get_store_capacity_forecast) since
--    this function also runs as service_role for the digest sender, which
--    is not a store member and would fail is_store_member().
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

  RETURN jsonb_build_object(
    'new_orders', v_new_orders,
    'billed', v_billed,
    'collected', v_collected,
    'outstanding_total', v_outstanding,
    'overdue_count', v_overdue_count,
    'garments_due_this_week', v_garments_due,
    'overloaded_weeks', v_overloaded_weeks
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_weekly_digest_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_weekly_digest_data(uuid) TO authenticated, service_role;

-- 6. Verification -- one row, every object this script is responsible for.
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'store_settings' AND column_name = 'weekly_capacity_estimate'
  ) AS store_settings_weekly_capacity_estimate,
  (to_regprocedure('public._store_weekly_throughput(uuid)') IS NOT NULL) AS store_weekly_throughput_fn,
  (to_regprocedure('public.get_store_capacity_forecast(uuid,int)') IS NOT NULL) AS get_store_capacity_forecast_fn,
  (to_regprocedure('public.get_order_capacity_check(uuid,date)') IS NOT NULL) AS get_order_capacity_check_fn,
  (pg_get_functiondef('public.get_weekly_digest_data(uuid)'::regprocedure) ILIKE '%overloaded_weeks%') AS get_weekly_digest_data_has_overloaded_weeks;

COMMIT;
