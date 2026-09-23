-- Restore check_rls_drift() to full coverage. Lovable's own independent
-- reimplementation (20260921174543) narrowed this in three ways versus the
-- version originally shipped for Security Phase 3:
--   1. Returns void instead of jsonb (harmless in itself, but paired with #3).
--   2. anon-grant allowlist is missing the legitimate `stores`/`stores_public`
--      SELECT grants from L2 -- every run would false-positive on those.
--   3. authenticated deny-list only checks 3 tables (app_settings, audit_logs,
--      rls_drift_checks) instead of the full L2 list -- real drift on
--      platform_admins, usage_log, ai_response_cache, etc. would go undetected.
-- It also never added the service-role variant a cron job needs, since
-- check_rls_drift() itself requires is_platform_admin() (a real admin
-- session), which no scheduled job can satisfy -- so the weekly check
-- was never actually running on a schedule.

DROP FUNCTION IF EXISTS public.check_rls_drift();

CREATE FUNCTION public.check_rls_drift()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tables_without_rls text[];
  v_public_role_policies text[];
  v_unexpected_anon_grants text[];
  v_unexpected_authenticated_grants text[];
  v_report jsonb;
  v_ok boolean;
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(array_agg(c.relname ORDER BY c.relname), '{}')
  INTO v_tables_without_rls
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;

  SELECT coalesce(array_agg(format('%s.%s', p.tablename, p.policyname) ORDER BY p.tablename), '{}')
  INTO v_public_role_policies
  FROM pg_policies p
  WHERE p.schemaname = 'public' AND p.roles = ARRAY['public']::name[];

  SELECT coalesce(array_agg(DISTINCT format('%s:%s', g.table_name, g.privilege_type) ORDER BY 1), '{}')
  INTO v_unexpected_anon_grants
  FROM information_schema.role_table_grants g
  WHERE g.grantee = 'anon'
    AND g.table_schema = 'public'
    AND NOT (
      (g.table_name = 'leads' AND g.privilege_type = 'INSERT')
      OR (g.table_name = 'sew_requests' AND g.privilege_type = 'INSERT')
      OR (g.table_name = 'consultation_requests' AND g.privilege_type = 'INSERT')
      OR (g.table_name = 'analytics_events' AND g.privilege_type = 'INSERT')
      OR (g.table_name = 'storefront_items' AND g.privilege_type = 'SELECT')
      OR (g.table_name = 'stores_public' AND g.privilege_type = 'SELECT')
      OR (g.table_name = 'stores' AND g.privilege_type = 'SELECT')
    );

  SELECT coalesce(array_agg(DISTINCT format('%s:%s', g.table_name, g.privilege_type) ORDER BY 1), '{}')
  INTO v_unexpected_authenticated_grants
  FROM information_schema.role_table_grants g
  WHERE g.grantee = 'authenticated'
    AND g.table_schema = 'public'
    AND (
      g.table_name IN (
        'platform_admins', 'subscription_history', 'usage_log', 'usage_counters',
        'feature_usage_counters', 'ai_response_cache', 'ai_design_payments',
        'order_payment_links', 'audit_logs', 'app_settings', 'country_configs',
        'garment_type_aliases', 'calendar_event_overrides', 'rate_limit_hits'
      )
      OR (g.table_name IN ('plans', 'payment_accounts') AND g.privilege_type <> 'SELECT')
    );

  v_ok := array_length(v_tables_without_rls, 1) IS NULL
    AND array_length(v_public_role_policies, 1) IS NULL
    AND array_length(v_unexpected_anon_grants, 1) IS NULL
    AND array_length(v_unexpected_authenticated_grants, 1) IS NULL;

  v_report := jsonb_build_object(
    'checked_at', now(),
    'ok', v_ok,
    'tables_without_rls', to_jsonb(v_tables_without_rls),
    'public_role_policies', to_jsonb(v_public_role_policies),
    'unexpected_anon_grants', to_jsonb(v_unexpected_anon_grants),
    'unexpected_authenticated_grants', to_jsonb(v_unexpected_authenticated_grants)
  );

  INSERT INTO public.rls_drift_checks (ok, report) VALUES (v_ok, v_report);

  RETURN v_report;
END;
$$;

REVOKE ALL ON FUNCTION public.check_rls_drift() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_rls_drift() TO authenticated;

-- Service-role variant with identical checks but no is_platform_admin()
-- gate, so the weekly cron job can actually call it. Never exposed to
-- anon/authenticated.
CREATE OR REPLACE FUNCTION public.check_rls_drift_as_service()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tables_without_rls text[];
  v_public_role_policies text[];
  v_unexpected_anon_grants text[];
  v_unexpected_authenticated_grants text[];
  v_report jsonb;
  v_ok boolean;
BEGIN
  SELECT coalesce(array_agg(c.relname ORDER BY c.relname), '{}')
  INTO v_tables_without_rls
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;

  SELECT coalesce(array_agg(format('%s.%s', p.tablename, p.policyname) ORDER BY p.tablename), '{}')
  INTO v_public_role_policies
  FROM pg_policies p
  WHERE p.schemaname = 'public' AND p.roles = ARRAY['public']::name[];

  SELECT coalesce(array_agg(DISTINCT format('%s:%s', g.table_name, g.privilege_type) ORDER BY 1), '{}')
  INTO v_unexpected_anon_grants
  FROM information_schema.role_table_grants g
  WHERE g.grantee = 'anon'
    AND g.table_schema = 'public'
    AND NOT (
      (g.table_name = 'leads' AND g.privilege_type = 'INSERT')
      OR (g.table_name = 'sew_requests' AND g.privilege_type = 'INSERT')
      OR (g.table_name = 'consultation_requests' AND g.privilege_type = 'INSERT')
      OR (g.table_name = 'analytics_events' AND g.privilege_type = 'INSERT')
      OR (g.table_name = 'storefront_items' AND g.privilege_type = 'SELECT')
      OR (g.table_name = 'stores_public' AND g.privilege_type = 'SELECT')
      OR (g.table_name = 'stores' AND g.privilege_type = 'SELECT')
    );

  SELECT coalesce(array_agg(DISTINCT format('%s:%s', g.table_name, g.privilege_type) ORDER BY 1), '{}')
  INTO v_unexpected_authenticated_grants
  FROM information_schema.role_table_grants g
  WHERE g.grantee = 'authenticated'
    AND g.table_schema = 'public'
    AND (
      g.table_name IN (
        'platform_admins', 'subscription_history', 'usage_log', 'usage_counters',
        'feature_usage_counters', 'ai_response_cache', 'ai_design_payments',
        'order_payment_links', 'audit_logs', 'app_settings', 'country_configs',
        'garment_type_aliases', 'calendar_event_overrides', 'rate_limit_hits'
      )
      OR (g.table_name IN ('plans', 'payment_accounts') AND g.privilege_type <> 'SELECT')
    );

  v_ok := array_length(v_tables_without_rls, 1) IS NULL
    AND array_length(v_public_role_policies, 1) IS NULL
    AND array_length(v_unexpected_anon_grants, 1) IS NULL
    AND array_length(v_unexpected_authenticated_grants, 1) IS NULL;

  v_report := jsonb_build_object(
    'checked_at', now(),
    'ok', v_ok,
    'tables_without_rls', to_jsonb(v_tables_without_rls),
    'public_role_policies', to_jsonb(v_public_role_policies),
    'unexpected_anon_grants', to_jsonb(v_unexpected_anon_grants),
    'unexpected_authenticated_grants', to_jsonb(v_unexpected_authenticated_grants)
  );

  INSERT INTO public.rls_drift_checks (ok, report) VALUES (v_ok, v_report);
END;
$$;

REVOKE ALL ON FUNCTION public.check_rls_drift_as_service() FROM PUBLIC, anon, authenticated;

-- Schedule it weekly if pg_cron + pg_net are available. No-op (not a failed
-- migration) if either extension isn't enabled on this project -- the
-- function above still works fine called manually from the admin dashboard.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    PERFORM cron.unschedule('rls-drift-weekly')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rls-drift-weekly');
    PERFORM cron.schedule(
      'rls-drift-weekly',
      '0 3 * * 1',
      $cron$SELECT public.check_rls_drift_as_service();$cron$
    );
  END IF;
END;
$$;
