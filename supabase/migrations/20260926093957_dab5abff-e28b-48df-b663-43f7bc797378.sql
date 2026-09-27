DO $$
DECLARE r record; d text;
BEGIN
  FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname IN ('check_rls_drift','check_rls_drift_as_service') LOOP
    d := replace(pg_get_functiondef(r.oid),
      'array_agg(DISTINCT format(''%s:%s'', g.table_name, g.privilege_type) ORDER BY 1)',
      'array_agg(DISTINCT format(''%s:%s'', g.table_name, g.privilege_type) ORDER BY format(''%s:%s'', g.table_name, g.privilege_type))');
    EXECUTE d;
  END LOOP;
END $$;