-- Fix the Ask Jaylor attachment cleanup cron added in the previous
-- migration: it scheduled ask-jaylor-cleanup-daily using a Supabase Vault
-- secret (jaylor_internal_api_secret) that was never actually created in
-- this database -- creating it was always a separate manual step (see the
-- original digest migration's own comment), and that step was never done.
--
-- The daily/weekly digest jobs (jaylor-daily-digest / jaylor-weekly-digest)
-- don't depend on that Vault secret any more either: their current
-- X-Internal-Secret header already carries the real INTERNAL_API_SECRET
-- value straight from Lovable Cloud Secrets, written directly into the
-- scheduled job's own command text. This migration reschedules
-- ask-jaylor-cleanup-daily the same way, by copying that literal secret
-- straight off the live jaylor-daily-digest (or jaylor-weekly-digest) job.
-- The secret value itself is never typed, pasted, or shown anywhere --
-- it moves from one cron job's definition to the other entirely inside
-- Postgres, so it never appears in this file or in git history.
--
-- Safe to rerun: it unschedules before rescheduling (the same guard every
-- cron job in this project uses), and it raises a clear error instead of
-- silently scheduling a broken job if a digest job's secret can't be found.

BEGIN;

DO $$
DECLARE
  v_secret text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     OR NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RETURN; -- same no-op-if-unavailable guard used elsewhere in this project
  END IF;

  -- The digest job's X-Internal-Secret header may have been written either
  -- as a jsonb_build_object(...) argument ('X-Internal-Secret', '<value>')
  -- or as a raw JSON string cast to jsonb ("X-Internal-Secret":"<value>") --
  -- try both shapes.
  SELECT coalesce(
    (regexp_match(command, $re1$'X-Internal-Secret'\s*,\s*'([^']*)'$re1$))[1],
    (regexp_match(command, $re2$"X-Internal-Secret"\s*:\s*"([^"]*)"$re2$))[1]
  )
  INTO v_secret
  FROM cron.job
  WHERE jobname IN ('jaylor-daily-digest', 'jaylor-weekly-digest')
  ORDER BY jobname
  LIMIT 1;

  IF v_secret IS NULL OR v_secret = '' THEN
    RAISE EXCEPTION 'Could not find a literal X-Internal-Secret value on the jaylor-daily-digest or jaylor-weekly-digest cron job. Make sure one of those jobs exists and carries the secret directly in its command (not a Vault lookup), then rerun this migration.';
  END IF;

  PERFORM cron.unschedule('ask-jaylor-cleanup-daily')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ask-jaylor-cleanup-daily');

  PERFORM cron.schedule(
    'ask-jaylor-cleanup-daily',
    '0 5 * * *',
    format(
      $cron$
        SELECT net.http_post(
          url := 'https://jaylor.com.ng/api/cron/ask-jaylor-cleanup',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'X-Internal-Secret', %L
          ),
          body := '{}'::jsonb
        );
      $cron$,
      v_secret
    )
  );
END;
$$;

COMMIT;

-- ============================================================
-- Verification: expect every row true, failed_checks empty.
-- ============================================================
SELECT
  bool_and(ok) AS all_true,
  coalesce(array_agg(check_name) FILTER (WHERE NOT ok), ARRAY[]::text[]) AS failed_checks
FROM (
  SELECT 'ask-jaylor-cleanup-daily cron job exists (only if pg_cron is installed)' AS check_name,
    (
      NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
      OR EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ask-jaylor-cleanup-daily')
    ) AS ok
  UNION ALL
  SELECT 'ask-jaylor-cleanup-daily carries a literal X-Internal-Secret value (not a Vault lookup)',
    (
      NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ask-jaylor-cleanup-daily')
      OR EXISTS (
        SELECT 1 FROM cron.job
        WHERE jobname = 'ask-jaylor-cleanup-daily'
          AND (
            command ~ $$'X-Internal-Secret'\s*,\s*'[^']+'$$
            OR command ~ $$"X-Internal-Secret"\s*:\s*"[^"]+"$$
          )
      )
    )
) checks;
