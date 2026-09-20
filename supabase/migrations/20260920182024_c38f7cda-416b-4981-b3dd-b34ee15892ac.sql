CREATE OR REPLACE FUNCTION public.price_whatsapp_delivery()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.delivered_at IS NULL THEN
    NEW.cost_usd := 0;
    NEW.cost_ngn := 0;
  ELSE
    NEW.cost_usd := CASE NEW.message_category
      WHEN 'marketing' THEN 0.0516
      WHEN 'utility' THEN 0.0067
      WHEN 'authentication' THEN 0.0067
      ELSE 0
    END;
    NEW.cost_ngn := round(NEW.cost_usd * 1331, 2);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.price_whatsapp_delivery() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER on_message_delivery_priced
  BEFORE INSERT OR UPDATE OF delivered_at, message_category ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.price_whatsapp_delivery();

CREATE OR REPLACE FUNCTION public.admin_growth_analytics(p_months int DEFAULT 12)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_since timestamptz := date_trunc('month', now()) - make_interval(months => greatest(1, least(p_months, 24)) - 1);
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  WITH
  visitors AS (
    SELECT count(DISTINCT visitor_id)::numeric AS n
    FROM public.analytics_events
    WHERE event_name = 'landing_view' AND occurred_at >= v_since
  ),
  signups AS (
    SELECT count(DISTINCT visitor_id)::numeric AS n
    FROM public.analytics_events
    WHERE event_name = 'signup_completed' AND occurred_at >= v_since
  ),
  store_activation AS (
    SELECT count(*)::numeric AS signups,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM public.orders o WHERE o.store_id = s.id
        AND o.created_at <= s.created_at + interval '24 hours'
      ))::numeric AS activated
    FROM public.stores s WHERE s.created_at >= v_since
  ),
  eligible_week4 AS (
    SELECT s.id, s.created_at FROM public.stores s
    WHERE s.created_at >= v_since AND s.created_at <= now() - interval '28 days'
  ),
  week4 AS (
    SELECT count(*)::numeric AS eligible,
      count(*) FILTER (WHERE
        EXISTS (SELECT 1 FROM public.orders o WHERE o.store_id = e.id AND o.created_at >= e.created_at + interval '21 days' AND o.created_at < e.created_at + interval '29 days')
        OR EXISTS (SELECT 1 FROM public.payments p WHERE p.store_id = e.id AND p.created_at >= e.created_at + interval '21 days' AND p.created_at < e.created_at + interval '29 days')
        OR EXISTS (SELECT 1 FROM public.clients c WHERE c.store_id = e.id AND c.created_at >= e.created_at + interval '21 days' AND c.created_at < e.created_at + interval '29 days')
      )::numeric AS active
    FROM eligible_week4 e
  ),
  trials AS (
    SELECT count(*)::numeric AS ended,
      count(*) FILTER (WHERE s.plan_code IN ('growth', 'business', 'custom'))::numeric AS converted
    FROM public.stores s
    WHERE s.created_at >= v_since AND s.trial_ends_at <= now()
  ),
  paying AS (
    SELECT count(*)::numeric AS n FROM public.stores
    WHERE plan_code IN ('growth', 'business', 'custom') AND trial_ends_at <= now() AND is_active
  ),
  whatsapp AS (
    SELECT coalesce(sum(cost_ngn), 0)::numeric AS cost FROM public.messages
    WHERE delivered_at >= date_trunc('month', now())
  ),
  monthly_money AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object('month', month_key, 'amount', amount) ORDER BY month_key), '[]'::jsonb) AS rows
    FROM (
      SELECT to_char(date_trunc('month', paid_at), 'YYYY-MM') AS month_key, sum(amount)::numeric AS amount
      FROM public.payments WHERE paid_at >= v_since AND voided = false
      GROUP BY date_trunc('month', paid_at)
    ) m
  )
  SELECT jsonb_build_object(
    'period_start', v_since,
    'visitor_count', visitors.n,
    'signup_count', signups.n,
    'visitor_to_signup_rate', CASE WHEN visitors.n > 0 THEN round(signups.n * 100 / visitors.n, 1) END,
    'store_signup_count', store_activation.signups,
    'activated_store_count', store_activation.activated,
    'signup_to_first_order_rate', CASE WHEN store_activation.signups > 0 THEN round(store_activation.activated * 100 / store_activation.signups, 1) END,
    'week4_eligible_count', week4.eligible,
    'week4_active_count', week4.active,
    'week4_active_rate', CASE WHEN week4.eligible > 0 THEN round(week4.active * 100 / week4.eligible, 1) END,
    'trials_ended_count', trials.ended,
    'trial_converted_count', trials.converted,
    'trial_to_paid_rate', CASE WHEN trials.ended > 0 THEN round(trials.converted * 100 / trials.ended, 1) END,
    'paying_shop_count', paying.n,
    'whatsapp_cost_ngn', whatsapp.cost,
    'whatsapp_cost_per_paying_shop', CASE WHEN paying.n > 0 THEN round(whatsapp.cost / paying.n, 2) END,
    'monthly_money_collected', monthly_money.rows,
    'rate_assumptions', jsonb_build_object('reviewed_on', '2026-09-20', 'usd_ngn', 1331, 'utility_usd', 0.0067, 'marketing_usd', 0.0516, 'growth_allowance', 100, 'business_allowance', 200)
  ) INTO v_result
  FROM visitors, signups, store_activation, week4, trials, paying, whatsapp, monthly_money;
  RETURN v_result;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_growth_analytics(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_growth_analytics(int) TO authenticated;