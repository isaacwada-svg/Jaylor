-- Security fix L2 (High): anon/authenticated held blanket
-- INSERT/UPDATE/DELETE/SELECT grants on 45 of 47 public tables, with RLS as
-- the only real layer. Not exploitable today (RLS is enabled everywhere),
-- but structural: any future table created with RLS forgotten, or any
-- permissive policy added during a refactor, becomes immediately
-- unauthenticated read/write.
--
-- Two moves, verified against actual client code (src/), not guessed:
--
-- 1. anon: REVOKE everything, then re-grant only the exact narrow set of
--    operations real public (unauthenticated) pages actually perform.
-- 2. authenticated: leave its existing grants on normal app tables alone
--    (those are legitimately used and already scoped per-row by RLS) —
--    instead REVOKE ALL specifically on the tables that should only ever
--    be reached through a SECURITY DEFINER RPC or the service role, and
--    downgrade two tables (`plans`, `payment_accounts`) to SELECT-only
--    since the client only ever reads them directly; writes go through
--    admin/payout RPCs.

-- ============================================================
-- 1. anon: revoke everything, re-grant the precise minimum
-- ============================================================

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- Public write endpoints (marketing site lead form, storefront "sew this
-- for me" request, consultation booking widget, landing-page analytics).
GRANT INSERT ON public.leads TO anon;
GRANT INSERT ON public.sew_requests TO anon;
GRANT INSERT ON public.consultation_requests TO anon;
GRANT INSERT ON public.analytics_events TO anon;

-- Public read surfaces (storefront items list, the stores_public view).
GRANT SELECT ON public.storefront_items TO anon;
GRANT SELECT ON public.stores_public TO anon;

-- stores: only the ten storefront-safe columns, gated further by the
-- existing stores_select_public RLS policy (is_active = true). Restores
-- the column-level grant a blanket REVOKE ALL would otherwise remove.
GRANT SELECT (id, name, slug, logo_url, accent_color, city, cover_url, bio, whatsapp_phone, opening_hours, is_active)
  ON public.stores TO anon;

-- ============================================================
-- 2. authenticated: deny-list for admin/internal/RPC-only tables
-- ============================================================

REVOKE ALL ON public.platform_admins FROM authenticated;
REVOKE ALL ON public.subscription_history FROM authenticated;
REVOKE ALL ON public.usage_log FROM authenticated;
REVOKE ALL ON public.usage_counters FROM authenticated;
REVOKE ALL ON public.feature_usage_counters FROM authenticated;
REVOKE ALL ON public.ai_response_cache FROM authenticated;
REVOKE ALL ON public.ai_design_payments FROM authenticated;
REVOKE ALL ON public.order_payment_links FROM authenticated;
REVOKE ALL ON public.audit_logs FROM authenticated;
REVOKE ALL ON public.app_settings FROM authenticated;
REVOKE ALL ON public.country_configs FROM authenticated;
REVOKE ALL ON public.garment_type_aliases FROM authenticated;
REVOKE ALL ON public.calendar_event_overrides FROM authenticated;

-- Re-affirm rate_limit_hits stays service_role-only (already fixed once;
-- included here defensively so this migration is a complete statement of
-- intended end state).
REVOKE ALL ON public.rate_limit_hits FROM anon, authenticated;

-- Downgrades: client only ever SELECTs these directly. Plan changes go
-- through admin_update_plan (RPC); payout account changes go through the
-- payout-account RPC — neither needs table-level write grants.
REVOKE ALL ON public.plans FROM authenticated;
GRANT SELECT ON public.plans TO authenticated;

REVOKE ALL ON public.payment_accounts FROM authenticated;
GRANT SELECT ON public.payment_accounts TO authenticated;
