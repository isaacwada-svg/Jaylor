-- Security Phase 3 (2/2): weekly RLS/grant drift check. L1-L9 closed
-- specific findings, but grants and policies can silently widen again in a
-- future change (a new table forgetting RLS, a permissive policy added
-- during a refactor, a table-level grant re-broadening a column-scoped
-- one). This function re-checks the same conditions those findings fixed,
-- returns a jsonb report, and records it in an append-only history table
-- a platform admin can review at any time.

CREATE TABLE IF NOT EXISTS public.rls_drift_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checked_at timestamptz NOT NULL DEFAULT now(),
  ok boolean NOT NULL,
  report jsonb NOT NULL
);

ALTER TABLE public.rls_drift_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_drift_checks_admin_read ON public.rls_drift_checks;
CREATE POLICY rls_drift_checks_admin_read
  ON public.rls_drift_checks FOR SELECT TO authenticated
  USING (is_platform_admin());

REVOKE ALL ON public.rls_drift_checks FROM anon, authenticated;
GRANT SELECT ON public.rls_drift_checks TO authenticated;

CREATE OR REPLACE FUNCTION public.check_rls_drift()
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

  -- 1. Every public table should have RLS enabled (L2's whole premise).
  SELECT coalesce(array_agg(c.relname ORDER BY c.relname), '{}')
  INTO v_tables_without_rls
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;

  -- 2. No policy should target the bare "public" pseudo-role (L9).
  SELECT coalesce(array_agg(format('%s.%s', p.tablename, p.policyname) ORDER BY p.tablename), '{}')
  INTO v_public_role_policies
  FROM pg_policies p
  WHERE p.schemaname = 'public' AND p.roles = ARRAY['public']::name[];

  -- 3. anon should only ever hold the narrow set of grants L2 established.
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

  -- 4. authenticated should hold nothing on the admin/internal/RPC-only
  --    tables L2 denied it, and only SELECT on the two downgraded tables.
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

-- Schedule it weekly if pg_cron + pg_net are available (Supabase's usual
-- cron-to-function pattern). If either extension isn't enabled on this
-- project, this block is a no-op rather than a failed migration — the
-- function above still works fine called manually (e.g. from the admin
-- dashboard) in that case.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    PERFORM cron.unschedule('rls-drift-weekly')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rls-drift-weekly');
    PERFORM cron.schedule(
      'rls-drift-weekly',
      '0 3 * * 1', -- Mondays 03:00 UTC
      $cron$SELECT public.check_rls_drift_as_service();$cron$
    );
  END IF;
END;
$$;

-- check_rls_drift() itself requires is_platform_admin() (a real signed-in
-- admin session), which a cron job has no way to satisfy — this
-- service-role variant does the identical checks without that gate, for
-- the scheduled job only. Never exposed to anon/authenticated.
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
