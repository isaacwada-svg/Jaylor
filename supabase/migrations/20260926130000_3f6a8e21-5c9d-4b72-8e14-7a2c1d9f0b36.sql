-- Live-board stats for the platform admin Overview tab: the headline stat
-- tiles, a daily revenue series for the trend chart, and a top-stores-by-
-- revenue ranking. Read-only, gated to any platform admin.

CREATE OR REPLACE FUNCTION public.admin_live_board_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN jsonb_build_object(
    'active_stores', (SELECT count(*) FROM public.stores WHERE is_active),
    'sales_30d', (SELECT coalesce(sum(amount), 0) FROM public.payments WHERE paid_at >= now() - interval '30 days' AND NOT voided),
    'sales_today', (SELECT coalesce(sum(amount), 0) FROM public.payments WHERE paid_at >= date_trunc('day', now()) AND NOT voided),
    'avg_order_value_30d', (SELECT coalesce(avg(amount), 0) FROM public.payments WHERE paid_at >= now() - interval '30 days' AND NOT voided),
    'new_stores_30d', (SELECT count(*) FROM public.stores WHERE created_at >= now() - interval '30 days'),
    'stores_on_trial', (SELECT count(*) FROM public.stores WHERE trial_ends_at > now()),
    'stores_converted', (SELECT count(*) FROM public.stores WHERE trial_ends_at <= now() AND plan_code <> 'free' AND is_active),
    'stores_inactive', (SELECT count(*) FROM public.stores WHERE NOT is_active)
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_live_board_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_live_board_stats() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_revenue_series(p_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days int := greatest(1, least(p_days, 90));
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN (
    SELECT coalesce(jsonb_agg(jsonb_build_object('day', day, 'amount', amount) ORDER BY day), '[]'::jsonb)
    FROM (
      SELECT d::date AS day, coalesce(sum(p.amount), 0) AS amount
      FROM generate_series(current_date - (v_days - 1), current_date, interval '1 day') d
      LEFT JOIN public.payments p ON p.paid_at::date = d::date AND NOT p.voided
      GROUP BY d
      ORDER BY d
    ) series
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_revenue_series(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_revenue_series(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_top_stores_by_revenue(p_days int DEFAULT 30, p_limit int DEFAULT 5)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'store_id', store_id, 'store_name', store_name, 'amount', amount
    ) ORDER BY amount DESC), '[]'::jsonb)
    FROM (
      SELECT p.store_id, s.name AS store_name, sum(p.amount) AS amount
      FROM public.payments p
      JOIN public.stores s ON s.id = p.store_id
      WHERE p.paid_at >= now() - make_interval(days => greatest(1, least(p_days, 90))) AND NOT p.voided
      GROUP BY p.store_id, s.name
      ORDER BY amount DESC
      LIMIT greatest(1, least(p_limit, 20))
    ) top
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_top_stores_by_revenue(int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_top_stores_by_revenue(int, int) TO authenticated;
