-- The previous fix (20261006091500) looked for the literal X-Internal-Secret
-- value on cron jobs named exactly 'jaylor-daily-digest' or
-- 'jaylor-weekly-digest'. The real job is named 'jaylor-digest-daily'
-- (digest/daily swapped), so nothing matched and that migration raised an
-- exception and rolled back cleanly -- no partial state, nothing to undo.
--
-- This version doesn't guess a job name at all: it searches every other
-- cron job for one that actually carries a literal X-Internal-Secret value
-- (in either the jsonb_build_object(...) form or the raw-JSON-string form --
-- confirmed live to be the raw-JSON form) and copies that.
--
-- Safe to rerun: unschedules before rescheduling (the same guard every cron
-- job in this project uses), and raises a clear error instead of silently
-- scheduling a broken job if no such job can be found.

BEGIN;

DO $$
DECLARE
  v_secret text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     OR NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RETURN; -- same no-op-if-unavailable guard used elsewhere in this project
  END IF;

  SELECT found.secret INTO v_secret
  FROM (
    SELECT
      coalesce(
        (regexp_match(command, $re1$'X-Internal-Secret'\s*,\s*'([^']*)'$re1$))[1],
        (regexp_match(command, $re2$"X-Internal-Secret"\s*:\s*"([^"]*)"$re2$))[1]
      ) AS secret,
      jobname
    FROM cron.job
    WHERE jobname <> 'ask-jaylor-cleanup-daily'
      AND command ~ 'X-Internal-Secret'
  ) found
  WHERE found.secret IS NOT NULL AND found.secret <> ''
  ORDER BY (found.jobname LIKE '%digest%') DESC, found.jobname
  LIMIT 1;

  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'Could not find any other cron job carrying a literal X-Internal-Secret value to copy. Make sure the digest cron job exists and carries the secret directly in its command (not a Vault lookup), then rerun this migration.';
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
