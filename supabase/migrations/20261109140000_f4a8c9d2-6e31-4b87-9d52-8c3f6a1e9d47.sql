-- Platform-admin email alerts: new signup + RLS drift failure (the other
-- two v1 alert kinds -- Paystack webhook signature failures and dedicated
-- account failures -- are relayed straight from the paystack-webhook edge
-- function, which already runs server-side; see that function's
-- relayPlatformAlert()). Both triggers here call the same
-- /api/internal/platform-alert route via net.http_post, reusing the exact
-- X-Internal-Secret value already live on another cron job rather than
-- hardcoding it here (same trick as migration 20261006103000).
--
-- Never blocks the row that triggered it: every step that can fail
-- (finding the secret, pg_net being unavailable, the HTTP call itself) is
-- swallowed. A broken alert must never be the reason a signup or an RLS
-- check insert fails.

BEGIN;

CREATE OR REPLACE FUNCTION public.relay_platform_alert(p_kind text, p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     OR NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RETURN;
  END IF;

  SELECT found.secret INTO v_secret
  FROM (
    SELECT
      coalesce(
        (regexp_match(command, $re1$'X-Internal-Secret'\s*,\s*'([^']*)'$re1$))[1],
        (regexp_match(command, $re2$"X-Internal-Secret"\s*:\s*"([^"]*)"$re2$))[1]
      ) AS secret
    FROM cron.job
    WHERE command ~ 'X-Internal-Secret'
  ) found
  WHERE found.secret IS NOT NULL AND found.secret <> ''
  LIMIT 1;

  IF v_secret IS NULL THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://jaylor.com.ng/api/internal/platform-alert',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Internal-Secret', v_secret
    ),
    body := jsonb_build_object('kind', p_kind, 'details', p_payload)
  );
EXCEPTION WHEN OTHERS THEN
  -- Best-effort: a failed alert relay must never fail the triggering insert.
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.relay_platform_alert(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.relay_platform_alert(text, jsonb) TO service_role;

-- ============================================================
-- New signup
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_new_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_email text;
BEGIN
  SELECT email INTO v_owner_email FROM auth.users WHERE id = NEW.owner_id;

  PERFORM public.relay_platform_alert('signup', jsonb_build_object(
    'storeName', NEW.name,
    'city', NEW.city,
    'ownerEmail', v_owner_email,
    'storeId', NEW.id
  ));
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_new_signup() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_new_signup_after_insert ON public.stores;
CREATE TRIGGER notify_new_signup_after_insert
AFTER INSERT ON public.stores
FOR EACH ROW EXECUTE FUNCTION public.notify_new_signup();

-- ============================================================
-- RLS drift check failure
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_rls_drift_failure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.relay_platform_alert('rls_drift', jsonb_build_object(
    'checkedAt', NEW.checked_at,
    'report', NEW.report
  ));
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_rls_drift_failure() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_rls_drift_failure_after_insert ON public.rls_drift_checks;
CREATE TRIGGER notify_rls_drift_failure_after_insert
AFTER INSERT ON public.rls_drift_checks
FOR EACH ROW
WHEN (NOT NEW.ok)
EXECUTE FUNCTION public.notify_rls_drift_failure();

COMMIT;

-- ============================================================
-- Verification: expect every row true, failed_checks empty.
-- ============================================================
SELECT
  bool_and(ok) AS all_true,
  coalesce(array_agg(check_name) FILTER (WHERE NOT ok), ARRAY[]::text[]) AS failed_checks
FROM (
  SELECT 'relay_platform_alert function exists' AS check_name,
    EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'relay_platform_alert'
    ) AS ok
  UNION ALL
  SELECT 'notify_new_signup_after_insert trigger exists on stores',
    EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'notify_new_signup_after_insert')
  UNION ALL
  SELECT 'notify_rls_drift_failure_after_insert trigger exists on rls_drift_checks',
    EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'notify_rls_drift_failure_after_insert')
) checks;
