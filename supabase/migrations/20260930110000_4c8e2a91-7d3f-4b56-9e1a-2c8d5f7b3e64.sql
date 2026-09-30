-- Step 3.3: on-time delivery score (Growth and above).
--
-- On-time = orders that reached "ready" on or before promised_date, out of
-- all orders that reached ready in the last 90 days. Computed on demand --
-- Lovable Cloud has no pg_cron, so there is no scheduled job here or
-- anywhere else in this script. Safe to run more than once.

BEGIN;

-- 1. Owner opt-in for the public storefront badge.
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS on_time_badge_enabled boolean NOT NULL DEFAULT false;

-- 2. Private helper (no grants -- reachable only from other SECURITY DEFINER
--    functions in this file, which run as their own owner regardless of
--    grants). Shared by the staff-facing and public wrappers below so the
--    on-time definition lives in exactly one place.
--
--    ready_time is read from order_status_history (first row where
--    to_status = 'ready'), falling back to orders.ready_at for any order
--    whose history predates this column existing. promised_date (not
--    delivery_date) is the comparison target, per Step 3.2, so a shop
--    silently pushing delivery_date back can't inflate this score.
CREATE OR REPLACE FUNCTION public._store_on_time_stats(p_store_id uuid, p_days int DEFAULT 90)
RETURNS TABLE(rate int, orders_counted int, has_enough_data boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_counted int;
  v_on_time int;
BEGIN
  SELECT
    count(*),
    count(*) FILTER (WHERE t.ready_time::date <= t.promised_date)
  INTO v_counted, v_on_time
  FROM (
    SELECT
      o.promised_date,
      coalesce(
        (
          SELECT h.changed_at FROM public.order_status_history h
          WHERE h.order_id = o.id AND h.to_status = 'ready'
          ORDER BY h.changed_at ASC
          LIMIT 1
        ),
        o.ready_at
      ) AS ready_time
    FROM public.orders o
    WHERE o.store_id = p_store_id AND o.promised_date IS NOT NULL
  ) t
  WHERE t.ready_time IS NOT NULL AND t.ready_time >= now() - (p_days || ' days')::interval;

  RETURN QUERY SELECT
    CASE WHEN coalesce(v_counted, 0) > 0
      THEN round((v_on_time::numeric / v_counted) * 100)::int
      ELSE NULL
    END,
    coalesce(v_counted, 0),
    coalesce(v_counted, 0) >= 10;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._store_on_time_stats(uuid, int) FROM PUBLIC, anon, authenticated;

-- 3. Staff-facing: dashboard card, Reports page, anywhere signed-in staff
--    need the score. Only members of the store may call this.
CREATE OR REPLACE FUNCTION public.get_store_on_time_score(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stats record;
BEGIN
  IF NOT public.is_store_member(p_store_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_stats FROM public._store_on_time_stats(p_store_id);

  RETURN jsonb_build_object(
    'rate', v_stats.rate,
    'orders_counted', v_stats.orders_counted,
    'has_enough_data', v_stats.has_enough_data
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_store_on_time_score(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_store_on_time_score(uuid) TO authenticated;

-- 4. Public storefront badge -- never reads orders/order_status_history
--    directly from a public page. Only returns data when the shop has
--    opted in, is on Growth or above (or still in its Growth trial, same
--    rule the client's effectiveTier() uses), is active, and has enough
--    orders counted; otherwise NULL (page just hides the badge).
CREATE OR REPLACE FUNCTION public.get_storefront_on_time_badge(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store record;
  v_settings record;
  v_stats record;
  v_growth_or_above boolean;
BEGIN
  SELECT plan_code, trial_ends_at, is_active INTO v_store
  FROM public.stores WHERE id = p_store_id;
  IF NOT FOUND OR NOT v_store.is_active THEN
    RETURN NULL;
  END IF;

  v_growth_or_above :=
    (v_store.trial_ends_at IS NOT NULL AND v_store.trial_ends_at > now())
    OR coalesce(v_store.plan_code, 'free') <> 'free';
  IF NOT v_growth_or_above THEN
    RETURN NULL;
  END IF;

  SELECT on_time_badge_enabled INTO v_settings
  FROM public.store_settings WHERE store_id = p_store_id;
  IF NOT FOUND OR NOT v_settings.on_time_badge_enabled THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_stats FROM public._store_on_time_stats(p_store_id);
  IF NOT v_stats.has_enough_data THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object('rate', v_stats.rate, 'orders_counted', v_stats.orders_counted);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_storefront_on_time_badge(uuid) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.get_storefront_on_time_badge(uuid) TO anon, authenticated;

-- 5. Verification -- one row, every object this script is responsible for.
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'store_settings' AND column_name = 'on_time_badge_enabled'
  ) AS store_settings_on_time_badge_enabled,
  (to_regprocedure('public._store_on_time_stats(uuid,int)') IS NOT NULL) AS store_on_time_stats_fn,
  (to_regprocedure('public.get_store_on_time_score(uuid)') IS NOT NULL) AS get_store_on_time_score_fn,
  (to_regprocedure('public.get_storefront_on_time_badge(uuid)') IS NOT NULL) AS get_storefront_on_time_badge_fn;

COMMIT;
