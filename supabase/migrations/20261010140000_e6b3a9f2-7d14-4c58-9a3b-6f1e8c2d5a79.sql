-- Extend the free Growth trial from 14 to 30 days, matching the landing
-- page/pricing page copy. New stores insert into public.stores without
-- specifying trial_ends_at at all (see src/routes/onboarding.tsx), relying
-- entirely on this column's DEFAULT -- so changing the default is the only
-- backend change needed, and it only ever affects rows inserted after this
-- runs. Existing stores' trial_ends_at is untouched (this is not an UPDATE).
--
-- Safe to run more than once: ALTER COLUMN ... SET DEFAULT is idempotent.

ALTER TABLE public.stores ALTER COLUMN trial_ends_at SET DEFAULT (now() + interval '30 days');

-- ============================================================
-- Verification: expect every row true, failed_checks empty.
-- ============================================================
SELECT
  bool_and(ok) AS all_true,
  coalesce(array_agg(check_name) FILTER (WHERE NOT ok), ARRAY[]::text[]) AS failed_checks
FROM (
  SELECT 'stores.trial_ends_at default is 30 days' AS check_name,
    (
      SELECT column_default ILIKE '%30%'
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'stores' AND column_name = 'trial_ends_at'
    ) AS ok
) checks;
