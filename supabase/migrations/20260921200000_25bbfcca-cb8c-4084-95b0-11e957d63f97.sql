-- Security fix L9 (Low): eleven policies across expenses,
-- measurement_passports, measurement_passport_shares, message_topups,
-- order_payment_links, payment_accounts, platform_admins,
-- referral_rewards, store_invites, store_monthly_snapshots and
-- support_grants are declared TO public (evaluated for anonymous requests
-- too) instead of TO authenticated, even though each one's USING/WITH
-- CHECK already calls has_store_role/is_store_member/is_platform_admin,
-- which return false for a null auth.uid() — not exploitable today, but a
-- future change to any of those helpers (or one returning true for a null
-- uid) would expose these tables to anonymous requests rather than only
-- signed-in users.
--
-- ALTER POLICY ... TO authenticated only changes which roles a policy
-- applies to — it leaves the existing USING/WITH CHECK expression
-- untouched — so this doesn't require knowing each policy's exact body,
-- only its name and table. The audit only captured one policy's name
-- verbatim ("Owners and managers manage expenses" on expenses); the rest
-- are found dynamically from pg_policies rather than guessed, scoped
-- strictly to policies currently targeting exactly the public role on
-- these eleven named tables.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'expenses',
        'measurement_passports',
        'measurement_passport_shares',
        'message_topups',
        'order_payment_links',
        'payment_accounts',
        'platform_admins',
        'referral_rewards',
        'store_invites',
        'store_monthly_snapshots',
        'support_grants'
      )
      AND roles = ARRAY['public']::name[]
  LOOP
    EXECUTE format('ALTER POLICY %I ON %I.%I TO authenticated', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END;
$$;
