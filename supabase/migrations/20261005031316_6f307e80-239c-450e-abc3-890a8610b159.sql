-- Move voice order entry, WhatsApp reply drafts, the Ask Jaylor advisor, and
-- the customer-facing AI design generator onto System B (the per-store AI
-- credit wallet already built for style_preview/style_suggestions/
-- festive_message_ai): Gemini direct, reserve/charge/refund through
-- ai_ledger, the wallet check as the single gate. Also centralises the
-- USD->NGN rate admins already edit at /admin-ai, and adds a monthly AI
-- spend budget with an admin alert.
--
-- Safe to run more than once: every INSERT is ON CONFLICT DO NOTHING, every
-- UPDATE is guarded to only touch rows still at their old seeded value (so a
-- deliberate admin edit made between runs is never clobbered), and the new
-- function is OR REPLACE.

BEGIN;

-- 1. Two new wallet-gated feature keys. voice_order already exists (seeded
--    alongside style_preview/style_suggestions/festive_message_ai) and just
--    needs enabling in code (LIVE_FEATURES) -- no row change needed here.
INSERT INTO public.ai_feature_costs (feature_key, label, credits, model_key, min_plan) VALUES
  ('whatsapp_reply', 'WhatsApp reply draft', 1, 'model_text', 'free'),
  ('advisor_chat', 'Ask Jaylor advisor', 2, 'model_text', 'free')
ON CONFLICT (feature_key) DO NOTHING;

-- 2. Plan allowances: six live features now share each plan's monthly
--    credits instead of three, so allowances are raised to comfortably
--    cover typical usage of all six. Free also gets a small monthly
--    allowance for the first time (it previously only had the 10-lifetime
--    + 30-trial-days credits) so the two new everyday-utility features
--    (voice order, WhatsApp drafts) are usable in a small way without
--    requiring a top-up immediately. Guarded: only updates a plan still at
--    its original seeded value.
UPDATE public.ai_plan_allowances SET monthly_credits = 15 WHERE plan_code = 'free' AND monthly_credits = 0;
UPDATE public.ai_plan_allowances SET monthly_credits = 150 WHERE plan_code = 'growth' AND monthly_credits = 100;
UPDATE public.ai_plan_allowances SET monthly_credits = 400 WHERE plan_code = 'business' AND monthly_credits = 300;

-- 3. Monthly AI spend budget (separate from the daily caps already in
--    ai_config): read by the Node-side budget-alert check after every
--    charge, compared against this month's sum of ai_ledger.est_cost_usd
--    (the same figure admin_ai_cost_overview() already shows as
--    "month_usd"). Editable at /admin-ai's existing generic settings
--    section -- no UI change needed, it lists every ai_config row already.
INSERT INTO public.ai_config (key, value) VALUES ('monthly_budget_usd', '30')
ON CONFLICT (key) DO NOTHING;

-- 4. Public, safe-to-expose read of the same fx_rate_ngn_per_usd admins
--    edit at /admin-ai, for the two unauthenticated client-facing pages
--    (request-payment-button, the public order-tracking page) that show an
--    approximate USD equivalent to a client paying from abroad -- previously
--    a separate hardcoded constant in src/lib/fx.ts. No row-level data here,
--    just one number, so anon is fine.
CREATE OR REPLACE FUNCTION public.get_public_fx_rate() RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT (value #>> '{}')::numeric FROM public.ai_config WHERE key = 'fx_rate_ngn_per_usd'), 1600);
$$;
REVOKE ALL ON FUNCTION public.get_public_fx_rate() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_fx_rate() TO anon, authenticated;

COMMIT;

-- ============================================================
-- Verification: expect every row true, failed_checks empty.
-- ============================================================
SELECT
  bool_and(ok) AS all_true,
  coalesce(array_agg(check_name) FILTER (WHERE NOT ok), ARRAY[]::text[]) AS failed_checks
FROM (
  SELECT 'whatsapp_reply feature cost exists' AS check_name,
    EXISTS(SELECT 1 FROM public.ai_feature_costs WHERE feature_key = 'whatsapp_reply') AS ok
  UNION ALL
  SELECT 'advisor_chat feature cost exists',
    EXISTS(SELECT 1 FROM public.ai_feature_costs WHERE feature_key = 'advisor_chat')
  UNION ALL
  SELECT 'voice_order feature cost already exists (unchanged by this migration)',
    EXISTS(SELECT 1 FROM public.ai_feature_costs WHERE feature_key = 'voice_order')
  UNION ALL
  SELECT 'monthly_budget_usd configured',
    EXISTS(SELECT 1 FROM public.ai_config WHERE key = 'monthly_budget_usd')
  UNION ALL
  SELECT 'get_public_fx_rate exists', to_regprocedure('public.get_public_fx_rate()') IS NOT NULL
  UNION ALL
  SELECT 'anon can call get_public_fx_rate', has_function_privilege(
    'anon', 'public.get_public_fx_rate()', 'execute'
  )
  UNION ALL
  SELECT 'get_public_fx_rate returns a positive number',
    (SELECT public.get_public_fx_rate()) > 0
) checks;

-- ============================================================
-- Informational only: has anyone ever bought a WhatsApp message top-up?
-- (Context for hiding the purchase option -- the feature it tops up,
-- automatic WhatsApp sending, isn't live yet.) Past purchases and the
-- create/verify-message-topup functions are untouched by this migration.
-- ============================================================
SELECT
  count(*) AS message_topups_ever_bought,
  coalesce(sum(amount), 0) AS total_ngn_paid_for_message_topups
FROM public.message_topups
WHERE status = 'success';
