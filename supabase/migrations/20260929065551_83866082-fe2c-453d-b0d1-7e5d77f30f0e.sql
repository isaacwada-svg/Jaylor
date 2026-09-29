
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS ai_staff_allowed boolean NOT NULL DEFAULT false;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS ai_custom_allowance integer;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS festive_opt_out boolean NOT NULL DEFAULT false;

CREATE TABLE public.ai_config (key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.ai_config TO authenticated; GRANT ALL ON public.ai_config TO service_role;
GRANT INSERT, UPDATE ON public.ai_config TO authenticated;
ALTER TABLE public.ai_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage ai_config" ON public.ai_config FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

CREATE TABLE public.ai_feature_costs (feature_key text PRIMARY KEY, label text NOT NULL, credits integer NOT NULL CHECK (credits >= 0), enabled boolean NOT NULL DEFAULT true, model_key text NOT NULL DEFAULT 'model_text', min_plan text NOT NULL DEFAULT 'free', updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE ON public.ai_feature_costs TO authenticated; GRANT ALL ON public.ai_feature_costs TO service_role;
ALTER TABLE public.ai_feature_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signed in read costs" ON public.ai_feature_costs FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage costs" ON public.ai_feature_costs FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

CREATE TABLE public.ai_credit_packs (id text PRIMARY KEY, name text NOT NULL, credits integer NOT NULL CHECK (credits > 0), price_ngn integer NOT NULL CHECK (price_ngn > 0), active boolean NOT NULL DEFAULT true, sort_order integer NOT NULL DEFAULT 0);
GRANT SELECT, INSERT, UPDATE ON public.ai_credit_packs TO authenticated; GRANT ALL ON public.ai_credit_packs TO service_role;
ALTER TABLE public.ai_credit_packs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signed in read packs" ON public.ai_credit_packs FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage packs" ON public.ai_credit_packs FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

CREATE TABLE public.ai_plan_allowances (plan_code text PRIMARY KEY, monthly_credits integer NOT NULL DEFAULT 0, lifetime_trial_credits integer NOT NULL DEFAULT 0, trial_period_credits integer NOT NULL DEFAULT 0);
GRANT SELECT, INSERT, UPDATE ON public.ai_plan_allowances TO authenticated; GRANT ALL ON public.ai_plan_allowances TO service_role;
ALTER TABLE public.ai_plan_allowances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signed in read allowances" ON public.ai_plan_allowances FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage allowances" ON public.ai_plan_allowances FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

CREATE TABLE public.ai_wallets (
  store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  plan_allowance integer NOT NULL DEFAULT 0, allowance_used integer NOT NULL DEFAULT 0,
  period_start timestamptz NOT NULL DEFAULT now(), period_end timestamptz NOT NULL DEFAULT (now() + interval '1 month'),
  topup_balance integer NOT NULL DEFAULT 0, topup_expires_at timestamptz,
  trial_credits_remaining integer NOT NULL DEFAULT 0, trial_period_granted boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.ai_wallets TO authenticated; GRANT ALL ON public.ai_wallets TO service_role;
ALTER TABLE public.ai_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read wallet" ON public.ai_wallets FOR SELECT TO authenticated USING (public.is_store_member(store_id) OR public.is_platform_admin());

CREATE TABLE public.ai_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid, feature_key text NOT NULL, credits integer NOT NULL,
  source text NOT NULL, parts jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','charged','refunded')),
  model text, input_tokens integer, output_tokens integer, est_cost_usd numeric, est_cost_ngn numeric,
  error_code text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX ai_ledger_store_created ON public.ai_ledger(store_id, created_at DESC);
CREATE INDEX ai_ledger_created ON public.ai_ledger(created_at);
GRANT SELECT ON public.ai_ledger TO authenticated; GRANT ALL ON public.ai_ledger TO service_role;
ALTER TABLE public.ai_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read ledger" ON public.ai_ledger FOR SELECT TO authenticated USING (public.is_store_member(store_id) OR public.is_platform_admin());

CREATE TABLE public.ai_topup_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  pack_id text NOT NULL REFERENCES public.ai_credit_packs(id), credits integer NOT NULL, amount_ngn integer NOT NULL,
  payment_reference text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','success','failed')),
  created_by uuid, paid_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.ai_topup_purchases TO authenticated; GRANT ALL ON public.ai_topup_purchases TO service_role;
ALTER TABLE public.ai_topup_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read purchases" ON public.ai_topup_purchases FOR SELECT TO authenticated USING (public.is_store_member(store_id) OR public.is_platform_admin());

CREATE TABLE public.ai_style_previews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  image_path text NOT NULL, fabric_path text, garment_type text, description text, occasion text, gender text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX ai_style_previews_store ON public.ai_style_previews(store_id, created_at DESC);
GRANT SELECT, UPDATE, DELETE ON public.ai_style_previews TO authenticated; GRANT ALL ON public.ai_style_previews TO service_role;
ALTER TABLE public.ai_style_previews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read previews" ON public.ai_style_previews FOR SELECT TO authenticated USING (public.is_store_member(store_id));
CREATE POLICY "members update previews" ON public.ai_style_previews FOR UPDATE TO authenticated USING (public.is_store_member(store_id)) WITH CHECK (public.is_store_member(store_id));
CREATE POLICY "members delete previews" ON public.ai_style_previews FOR DELETE TO authenticated USING (public.is_store_member(store_id));

CREATE TABLE public.store_occasions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 80), event_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_occasions TO authenticated; GRANT ALL ON public.store_occasions TO service_role;
ALTER TABLE public.store_occasions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage occasions" ON public.store_occasions FOR ALL TO authenticated USING (public.is_store_member(store_id)) WITH CHECK (public.is_store_member(store_id));

CREATE TABLE public.festive_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  occasion_key text NOT NULL, occasion_label text NOT NULL, occasion_date date NOT NULL,
  message text NOT NULL, language text NOT NULL DEFAULT 'English', client_ids uuid[] NOT NULL DEFAULT '{}',
  sent_client_ids uuid[] NOT NULL DEFAULT '{}',
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX festive_campaigns_store ON public.festive_campaigns(store_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.festive_campaigns TO authenticated; GRANT ALL ON public.festive_campaigns TO service_role;
ALTER TABLE public.festive_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read campaigns" ON public.festive_campaigns FOR SELECT TO authenticated USING (public.is_store_member(store_id));
CREATE POLICY "members create campaigns" ON public.festive_campaigns FOR INSERT TO authenticated WITH CHECK (public.is_store_member(store_id) AND created_by = auth.uid());
CREATE POLICY "members update campaigns" ON public.festive_campaigns FOR UPDATE TO authenticated USING (public.is_store_member(store_id)) WITH CHECK (public.is_store_member(store_id));

-- Seeds
INSERT INTO public.ai_config(key, value) VALUES
 ('ai_enabled','true'),('fx_rate_ngn_per_usd','1600'),('global_daily_cap_usd','10'),('store_daily_credit_cap','60'),
 ('model_text','"gemini-3.1-flash-lite"'),('model_image','"gemini-3.1-flash-image"'),
 ('price_text_input_per_m_usd','0.25'),('price_text_output_per_m_usd','1.5'),('price_image_usd','0.067'),
 ('low_credit_warning_pct','20')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.ai_feature_costs(feature_key,label,credits,model_key) VALUES
 ('style_preview','Style preview',10,'model_image'),('style_suggestions','Style ideas',2,'model_text'),
 ('festive_message_ai','Festive message',1,'model_text'),('pricing_advisor','Pricing advice',1,'model_text'),
 ('debt_reminder_ai','Debt reminder messages',1,'model_text'),('insights_summary','Business summary',2,'model_text'),
 ('voice_order','Voice order',1,'model_text'),('portfolio_caption','Portfolio caption',1,'model_text')
ON CONFLICT DO NOTHING;

INSERT INTO public.ai_credit_packs(id,name,credits,price_ngn,sort_order) VALUES
 ('starter','Starter',50,1500,1),('value','Value',150,4000,2),('pro','Pro',400,10000,3) ON CONFLICT DO NOTHING;

INSERT INTO public.ai_plan_allowances(plan_code,monthly_credits,lifetime_trial_credits,trial_period_credits) VALUES
 ('free',0,10,30),('growth',100,0,0),('business',300,0,0),('custom',0,0,0) ON CONFLICT DO NOTHING;

INSERT INTO public.calendar_event_defs(key,label,kind,easter_offset_days,default_enabled,sort_order)
 VALUES ('mothering_sunday','Mothering Sunday','gregorian_easter_relative',-21,true,35) ON CONFLICT DO NOTHING;
INSERT INTO public.calendar_event_defs(key,label,kind,fixed_month,fixed_day,default_enabled,sort_order)
 VALUES ('end_of_year_parties','End-of-year parties','fixed_date',12,15,true,125) ON CONFLICT DO NOTHING;

-- Wallet: create + roll period. Internal only.
CREATE OR REPLACE FUNCTION public.ai_ensure_wallet(p_store_id uuid) RETURNS public.ai_wallets
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w public.ai_wallets; s public.stores; a public.ai_plan_allowances; v_allow integer; v_in_trial boolean;
BEGIN
  SELECT * INTO s FROM stores WHERE id = p_store_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'store not found'; END IF;
  v_in_trial := s.plan_code = 'free' AND s.trial_ends_at IS NOT NULL AND s.trial_ends_at > now();
  SELECT * INTO a FROM ai_plan_allowances WHERE plan_code = s.plan_code;
  v_allow := CASE WHEN s.plan_code = 'custom' THEN COALESCE(s.ai_custom_allowance, 0) ELSE COALESCE(a.monthly_credits, 0) END;
  SELECT * INTO w FROM ai_wallets WHERE store_id = p_store_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO ai_wallets(store_id, plan_allowance, trial_credits_remaining, trial_period_granted)
    VALUES (p_store_id, v_allow,
      CASE WHEN v_in_trial THEN (SELECT trial_period_credits FROM ai_plan_allowances WHERE plan_code='free')
           WHEN s.plan_code = 'free' THEN (SELECT lifetime_trial_credits FROM ai_plan_allowances WHERE plan_code='free') ELSE 0 END,
      v_in_trial)
    RETURNING * INTO w;
    RETURN w;
  END IF;
  IF w.period_end <= now() THEN
    w.period_start := w.period_end;
    WHILE w.period_start + interval '1 month' <= now() LOOP w.period_start := w.period_start + interval '1 month'; END LOOP;
    w.period_end := w.period_start + interval '1 month';
    w.allowance_used := 0;
  END IF;
  w.plan_allowance := v_allow;
  IF w.topup_expires_at IS NOT NULL AND w.topup_expires_at <= now() THEN w.topup_balance := 0; END IF;
  UPDATE ai_wallets SET plan_allowance = w.plan_allowance, allowance_used = w.allowance_used,
    period_start = w.period_start, period_end = w.period_end, topup_balance = w.topup_balance, updated_at = now()
  WHERE store_id = p_store_id RETURNING * INTO w;
  RETURN w;
END $$;
REVOKE ALL ON FUNCTION public.ai_ensure_wallet(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ai_wallet_json(w public.ai_wallets) RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT jsonb_build_object(
    'plan_allowance', w.plan_allowance, 'allowance_used', w.allowance_used,
    'allowance_left', GREATEST(w.plan_allowance - w.allowance_used, 0),
    'topup_balance', w.topup_balance, 'topup_expires_at', w.topup_expires_at,
    'trial_credits_remaining', w.trial_credits_remaining,
    'total', GREATEST(w.plan_allowance - w.allowance_used, 0) + w.topup_balance + w.trial_credits_remaining,
    'period_start', w.period_start, 'period_end', w.period_end,
    'plan_code', (SELECT plan_code FROM stores WHERE id = w.store_id),
    'effective_plan', public.effective_plan_code(w.store_id),
    'staff_allowed', (SELECT ai_staff_allowed FROM stores WHERE id = w.store_id))
$$;
REVOKE ALL ON FUNCTION public.ai_wallet_json(public.ai_wallets) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_ai_wallet(p_store_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_store_member(p_store_id) AND NOT public.is_platform_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  RETURN public.ai_wallet_json(public.ai_ensure_wallet(p_store_id));
END $$;
REVOKE ALL ON FUNCTION public.get_ai_wallet(uuid) FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION public.get_ai_wallet(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_store_ai_staff_allowed(p_store_id uuid, p_allowed boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM store_members WHERE store_id = p_store_id AND user_id = auth.uid() AND role = 'owner' AND status = 'active') THEN
    RAISE EXCEPTION 'Only the shop owner can change this'; END IF;
  UPDATE stores SET ai_staff_allowed = p_allowed WHERE id = p_store_id;
END $$;
REVOKE ALL ON FUNCTION public.set_store_ai_staff_allowed(uuid, boolean) FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION public.set_store_ai_staff_allowed(uuid, boolean) TO authenticated;

-- Reserve (service role only)
CREATE OR REPLACE FUNCTION public.reserve_ai_credits(p_store_id uuid, p_feature_key text, p_user_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w public.ai_wallets; v_cost integer; v_need integer; v_a integer := 0; v_t integer := 0; v_u integer := 0; v_id uuid; v_src text;
BEGIN
  SELECT credits INTO v_cost FROM ai_feature_costs WHERE feature_key = p_feature_key;
  IF v_cost IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'UNKNOWN_FEATURE'); END IF;
  w := public.ai_ensure_wallet(p_store_id);
  SELECT * INTO w FROM ai_wallets WHERE store_id = p_store_id FOR UPDATE;
  IF GREATEST(w.plan_allowance - w.allowance_used,0) + w.trial_credits_remaining + w.topup_balance < v_cost THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INSUFFICIENT_CREDITS', 'needed', v_cost, 'wallet', public.ai_wallet_json(w));
  END IF;
  v_need := v_cost;
  v_a := LEAST(v_need, GREATEST(w.plan_allowance - w.allowance_used, 0)); v_need := v_need - v_a;
  v_t := LEAST(v_need, w.trial_credits_remaining); v_need := v_need - v_t;
  v_u := LEAST(v_need, w.topup_balance); v_need := v_need - v_u;
  UPDATE ai_wallets SET allowance_used = allowance_used + v_a, trial_credits_remaining = trial_credits_remaining - v_t,
    topup_balance = topup_balance - v_u, updated_at = now() WHERE store_id = p_store_id RETURNING * INTO w;
  v_src := CASE WHEN v_a = v_cost THEN 'allowance' WHEN v_t = v_cost THEN 'trial' WHEN v_u = v_cost THEN 'topup' ELSE 'mixed' END;
  INSERT INTO ai_ledger(store_id, user_id, feature_key, credits, source, parts)
  VALUES (p_store_id, p_user_id, p_feature_key, v_cost, v_src, jsonb_build_object('allowance', v_a, 'trial', v_t, 'topup', v_u))
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'ledger_id', v_id, 'credits', v_cost, 'wallet', public.ai_wallet_json(w));
END $$;
REVOKE ALL ON FUNCTION public.reserve_ai_credits(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_credits(uuid, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.charge_ai_credits(p_ledger_id uuid, p_usage jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_fx numeric;
BEGIN
  SELECT (value #>> '{}')::numeric INTO v_fx FROM ai_config WHERE key = 'fx_rate_ngn_per_usd';
  UPDATE ai_ledger SET status = 'charged', model = p_usage->>'model',
    input_tokens = NULLIF(p_usage->>'input_tokens','')::integer, output_tokens = NULLIF(p_usage->>'output_tokens','')::integer,
    est_cost_usd = COALESCE(NULLIF(p_usage->>'cost_usd','')::numeric, 0),
    est_cost_ngn = COALESCE(NULLIF(p_usage->>'cost_usd','')::numeric, 0) * COALESCE(v_fx, 1600), updated_at = now()
  WHERE id = p_ledger_id AND status = 'reserved';
END $$;
REVOKE ALL ON FUNCTION public.charge_ai_credits(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.charge_ai_credits(uuid, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.refund_ai_credits(p_ledger_id uuid, p_reason text, p_usage jsonb DEFAULT '{}'::jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.ai_ledger; v_fx numeric;
BEGIN
  SELECT * INTO l FROM ai_ledger WHERE id = p_ledger_id AND status = 'reserved' FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT (value #>> '{}')::numeric INTO v_fx FROM ai_config WHERE key = 'fx_rate_ngn_per_usd';
  UPDATE ai_wallets SET allowance_used = GREATEST(allowance_used - COALESCE((l.parts->>'allowance')::int,0), 0),
    trial_credits_remaining = trial_credits_remaining + COALESCE((l.parts->>'trial')::int,0),
    topup_balance = topup_balance + COALESCE((l.parts->>'topup')::int,0), updated_at = now()
  WHERE store_id = l.store_id;
  UPDATE ai_ledger SET status = 'refunded', error_code = left(p_reason, 200), model = p_usage->>'model',
    est_cost_usd = COALESCE(NULLIF(p_usage->>'cost_usd','')::numeric, 0),
    est_cost_ngn = COALESCE(NULLIF(p_usage->>'cost_usd','')::numeric, 0) * COALESCE(v_fx,1600), updated_at = now()
  WHERE id = p_ledger_id;
END $$;
REVOKE ALL ON FUNCTION public.refund_ai_credits(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_ai_credits(uuid, text, jsonb) TO service_role;

-- Idempotent top-up credit (service role only; called after Paystack verification)
CREATE OR REPLACE FUNCTION public.apply_ai_topup(p_reference text, p_paid_kobo bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.ai_topup_purchases;
BEGIN
  SELECT * INTO p FROM ai_topup_purchases WHERE payment_reference = p_reference FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'NOT_FOUND'); END IF;
  IF p.status = 'success' THEN RETURN jsonb_build_object('ok', true, 'already', true, 'credits', p.credits); END IF;
  IF p_paid_kobo < p.amount_ngn::bigint * 100 THEN RETURN jsonb_build_object('ok', false, 'error', 'UNDERPAID'); END IF;
  PERFORM public.ai_ensure_wallet(p.store_id);
  UPDATE ai_topup_purchases SET status = 'success', paid_at = now() WHERE id = p.id;
  UPDATE ai_wallets SET topup_balance = topup_balance + p.credits, topup_expires_at = now() + interval '12 months', updated_at = now()
  WHERE store_id = p.store_id;
  RETURN jsonb_build_object('ok', true, 'credits', p.credits);
END $$;
REVOKE ALL ON FUNCTION public.apply_ai_topup(text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_ai_topup(text, bigint) TO service_role;

-- Festive detection (no AI)
CREATE OR REPLACE FUNCTION public.festive_upcoming(p_store_id uuid, p_days integer DEFAULT 30) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb := '[]'::jsonb; d record; v_date date; v_last date; v_ids uuid[];
BEGIN
  IF NOT public.is_store_member(p_store_id) THEN RAISE EXCEPTION 'not allowed'; END IF;
  FOR d IN SELECT key, label FROM calendar_event_defs WHERE key IN
    ('christmas','new_year','easter','eid_al_fitr','eid_al_adha','independence_day','valentines','mothering_sunday','mothers_day','end_of_year_parties')
  LOOP
    SELECT event_date INTO v_date FROM public.next_calendar_occurrence(d.key, p_store_id, CURRENT_DATE);
    CONTINUE WHEN v_date IS NULL OR v_date > CURRENT_DATE + p_days;
    SELECT event_date INTO v_last FROM public.next_calendar_occurrence(d.key, p_store_id, (v_date - interval '1 year' - interval '40 days')::date);
    IF v_last IS NULL OR v_last >= v_date THEN v_last := (v_date - interval '1 year')::date; END IF;
    SELECT array_agg(DISTINCT c.id) INTO v_ids FROM clients c
     WHERE c.store_id = p_store_id AND NOT c.festive_opt_out AND (
       EXISTS (SELECT 1 FROM orders o WHERE o.client_id = c.id AND o.store_id = p_store_id
               AND o.created_at::date BETWEEN v_last - 21 AND v_last + 21)
       OR d.key = ANY(COALESCE(c.tags, '{}')) OR d.label = ANY(COALESCE(c.tags, '{}')));
    result := result || jsonb_build_object('key', d.key, 'label', d.label, 'date', v_date,
      'days_away', v_date - CURRENT_DATE, 'client_ids', to_jsonb(COALESCE(v_ids, '{}'::uuid[])));
  END LOOP;
  FOR d IN SELECT id, label, event_date FROM store_occasions WHERE store_id = p_store_id
    AND event_date BETWEEN CURRENT_DATE AND CURRENT_DATE + p_days LOOP
    SELECT array_agg(DISTINCT c.id) INTO v_ids FROM clients c
     WHERE c.store_id = p_store_id AND NOT c.festive_opt_out AND d.label = ANY(COALESCE(c.tags,'{}'));
    result := result || jsonb_build_object('key', 'store:' || d.id, 'label', d.label, 'date', d.event_date,
      'days_away', d.event_date - CURRENT_DATE, 'client_ids', to_jsonb(COALESCE(v_ids, '{}'::uuid[])));
  END LOOP;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.festive_upcoming(uuid, integer) FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION public.festive_upcoming(uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.festive_campaign_results(p_campaign_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.festive_campaigns; v_count integer; v_total numeric;
BEGIN
  SELECT * INTO c FROM festive_campaigns WHERE id = p_campaign_id;
  IF NOT FOUND OR NOT public.is_store_member(c.store_id) THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT count(*), COALESCE(sum(price), 0) INTO v_count, v_total FROM orders
   WHERE store_id = c.store_id AND client_id = ANY(c.sent_client_ids)
     AND created_at >= c.created_at AND created_at < c.created_at + interval '30 days';
  RETURN jsonb_build_object('orders', v_count, 'total', v_total);
END $$;
REVOKE ALL ON FUNCTION public.festive_campaign_results(uuid) FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION public.festive_campaign_results(uuid) TO authenticated;

-- Admin overview
CREATE OR REPLACE FUNCTION public.admin_ai_cost_overview() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_month timestamptz := date_trunc('month', now()); r jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT jsonb_build_object(
    'today_usd', (SELECT COALESCE(sum(est_cost_usd),0) FROM ai_ledger WHERE created_at >= date_trunc('day', now())),
    'today_ngn', (SELECT COALESCE(sum(est_cost_ngn),0) FROM ai_ledger WHERE created_at >= date_trunc('day', now())),
    'month_usd', (SELECT COALESCE(sum(est_cost_usd),0) FROM ai_ledger WHERE created_at >= v_month),
    'month_ngn', (SELECT COALESCE(sum(est_cost_ngn),0) FROM ai_ledger WHERE created_at >= v_month),
    'credits_used_month', (SELECT COALESCE(sum(credits),0) FROM ai_ledger WHERE status='charged' AND created_at >= v_month),
    'credits_sold_month', (SELECT COALESCE(sum(credits),0) FROM ai_topup_purchases WHERE status='success' AND paid_at >= v_month),
    'topup_revenue_month', (SELECT COALESCE(sum(amount_ngn),0) FROM ai_topup_purchases WHERE status='success' AND paid_at >= v_month),
    'stores', COALESCE((SELECT jsonb_agg(x ORDER BY x.ai_cost_ngn DESC) FROM (
      SELECT s.id, s.name, s.plan_code,
        COALESCE((SELECT sum(est_cost_ngn) FROM ai_ledger l WHERE l.store_id = s.id AND l.created_at >= v_month),0) AS ai_cost_ngn,
        COALESCE((SELECT sum(amount) FROM plan_payments pp WHERE pp.store_id = s.id AND pp.status='success' AND pp.paid_at >= v_month),0)
        + COALESCE((SELECT sum(amount_ngn) FROM ai_topup_purchases tp WHERE tp.store_id = s.id AND tp.status='success' AND tp.paid_at >= v_month),0) AS paid_ngn,
        s.ai_custom_allowance
      FROM stores s WHERE EXISTS (SELECT 1 FROM ai_ledger l WHERE l.store_id = s.id AND l.created_at >= v_month) OR s.plan_code = 'custom'
    ) x), '[]'::jsonb)
  ) INTO r;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.admin_ai_cost_overview() FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION public.admin_ai_cost_overview() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_store_ai_allowance(p_store_id uuid, p_credits integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  UPDATE stores SET ai_custom_allowance = GREATEST(p_credits, 0) WHERE id = p_store_id;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_store_ai_allowance(uuid, integer) FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION public.admin_set_store_ai_allowance(uuid, integer) TO authenticated;
