-- Defensive fix for custom job types (see job_templates, added earlier today):
-- if events.job_type carries a CHECK constraint restricting it to the original
-- fixed list of 10 built-in values (added out-of-band, outside this repo's
-- tracked migrations -- not visible from here), a custom job type would fail
-- to insert. This drops any such constraint if one exists; it's a no-op
-- otherwise, so it's safe to run whether or not the constraint is actually
-- there.
DO $$
DECLARE
  con record;
BEGIN
  FOR con IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'events'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%job_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.events DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;
