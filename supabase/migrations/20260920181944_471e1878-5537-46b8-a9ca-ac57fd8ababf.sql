CREATE TABLE public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL CHECK (event_name IN ('landing_view', 'signup_completed')),
  visitor_id uuid NOT NULL,
  user_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.analytics_events TO anon, authenticated;
GRANT SELECT ON public.analytics_events TO authenticated;
GRANT ALL ON public.analytics_events TO service_role;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "analytics_events_public_insert"
  ON public.analytics_events FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    event_name IN ('landing_view', 'signup_completed')
    AND occurred_at > now() - interval '5 minutes'
    AND occurred_at <= now() + interval '1 minute'
    AND (user_id IS NULL OR user_id = auth.uid())
  );
CREATE POLICY "analytics_events_admin_read"
  ON public.analytics_events FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());
CREATE INDEX analytics_events_name_occurred_idx
  ON public.analytics_events (event_name, occurred_at DESC);
CREATE INDEX analytics_events_visitor_idx
  ON public.analytics_events (visitor_id, event_name);

CREATE TABLE public.subscription_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  from_plan text,
  to_plan text NOT NULL REFERENCES public.plans(code),
  changed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscription_history TO authenticated;
GRANT ALL ON public.subscription_history TO service_role;
ALTER TABLE public.subscription_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscription_history_admin_read"
  ON public.subscription_history FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());
CREATE INDEX subscription_history_store_changed_idx
  ON public.subscription_history (store_id, changed_at DESC);

CREATE OR REPLACE FUNCTION public.track_store_plan_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.subscription_history (store_id, from_plan, to_plan, changed_at)
    VALUES (NEW.id, NULL, NEW.plan_code, NEW.created_at);
  ELSIF NEW.plan_code IS DISTINCT FROM OLD.plan_code THEN
    INSERT INTO public.subscription_history (store_id, from_plan, to_plan)
    VALUES (NEW.id, OLD.plan_code, NEW.plan_code);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.track_store_plan_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER on_store_plan_history
  AFTER INSERT OR UPDATE OF plan_code ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.track_store_plan_change();

ALTER TABLE public.messages
  ADD COLUMN message_category text NOT NULL DEFAULT 'service'
    CHECK (message_category IN ('service', 'utility', 'authentication', 'marketing')),
  ADD COLUMN delivered_at timestamptz,
  ADD COLUMN cost_usd numeric(10,6) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  ADD COLUMN cost_ngn numeric(12,2) NOT NULL DEFAULT 0 CHECK (cost_ngn >= 0);
CREATE INDEX messages_store_delivered_idx
  ON public.messages (store_id, delivered_at DESC)
  WHERE delivered_at IS NOT NULL;

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
    SELECT
      count(*)::numeric AS signups,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.store_id = s.id
          AND o.created_at <= s.created_at + interval '24 hours'
      ))::numeric AS activated
    FROM public.stores s
    WHERE s.created_at >= v_since
  ),
  eligible_week4 AS (
    SELECT s.id, s.created_at
    FROM public.stores s
    WHERE s.created_at >= v_since AND s.created_at <= now() - interval '28 days'
  ),
  week4 AS (
    SELECT
      count(*)::numeric AS eligible,
      count(*) FILTER (WHERE
        EXISTS (SELECT 1 FROM public.orders o WHERE o.store_id = e.id AND o.created_at >= e.created_at + interval '21 days' AND o.created_at < e.created_at + interval '29 days')
        OR EXISTS (SELECT 1 FROM public.payments p WHERE p.store_id = e.id AND p.created_at >= e.created_at + interval '21 days' AND p.created_at < e.created_at + interval '29 days')
        OR EXISTS (SELECT 1 FROM public.clients c WHERE c.store_id = e.id AND c.created_at >= e.created_at + interval '21 days' AND c.created_at < e.created_at + interval '29 days')
      )::numeric AS active
    FROM eligible_week4 e
  ),
  trials AS (
    SELECT
      count(*) FILTER (WHERE s.trial_ends_at <= now())::numeric AS ended,
      count(*) FILTER (WHERE s.trial_ends_at <= now() AND EXISTS (
        SELECT 1 FROM public.subscription_history h
        WHERE h.store_id = s.id
          AND h.from_plan = 'free'
          AND h.to_plan IN ('growth', 'business', 'custom')
      ))::numeric AS converted
    FROM public.stores s
    WHERE s.created_at >= v_since
  ),
  paying AS (
    SELECT count(*)::numeric AS n
    FROM public.stores
    WHERE plan_code IN ('growth', 'business', 'custom') AND trial_ends_at <= now() AND is_active
  ),
  whatsapp AS (
    SELECT coalesce(sum(cost_ngn), 0)::numeric AS cost
    FROM public.messages
    WHERE delivered_at >= date_trunc('month', now())
  ),
  monthly_money AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object('month', month_key, 'amount', amount) ORDER BY month_key), '[]'::jsonb) AS rows
    FROM (
      SELECT to_char(date_trunc('month', paid_at), 'YYYY-MM') AS month_key,
             sum(amount)::numeric AS amount
      FROM public.payments
      WHERE paid_at >= v_since AND voided = false
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
    'rate_assumptions', jsonb_build_object(
      'reviewed_on', '2026-09-20',
      'usd_ngn', 1331,
      'utility_usd', 0.0067,
      'marketing_usd', 0.0516,
      'growth_allowance', 100,
      'business_allowance', 200
    )
  ) INTO v_result
  FROM visitors, signups, store_activation, week4, trials, paying, whatsapp, monthly_money;

  RETURN v_result;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_growth_analytics(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_growth_analytics(int) TO authenticated;

UPDATE public.plans
SET limits = jsonb_set(limits, '{messages}', '100'::jsonb, true)
WHERE code = 'growth';
UPDATE public.plans
SET limits = jsonb_set(limits, '{messages}', '200'::jsonb, true)
WHERE code = 'business';