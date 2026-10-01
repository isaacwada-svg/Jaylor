-- store_settings has a SELECT policy (store_settings_select_members) and an
-- UPDATE policy (store_settings_write_managers), but no INSERT policy at
-- all. Confirmed live: `SELECT policyname, cmd FROM pg_policies WHERE
-- tablename = 'store_settings'` returns exactly those two rows.
--
-- This silently breaks onboarding.tsx's own upsert of the owner's phone
-- number right after store creation (`supabase.from("store_settings")
-- .upsert({ store_id, phone })`): PostgREST runs an upsert as an INSERT ...
-- ON CONFLICT DO UPDATE, and the INSERT half has no policy to satisfy, so
-- RLS rejects it with a 403 -- the phone number the owner just typed in is
-- silently lost (the call site doesn't check the error). The row for a new
-- store does already exist by the time this runs (handle_new_store() seeds
-- it via `INSERT INTO store_settings (store_id) VALUES (NEW.id)`), so the
-- ON CONFLICT branch is what actually needs to apply the new phone number
-- -- but Postgres still evaluates the INSERT policy before falling through
-- to ON CONFLICT, regardless of whether a conflict is ultimately hit.
--
-- Mirrors store_settings_write_managers' own condition exactly, so INSERT
-- and UPDATE are governed by the same rule: owner or manager.

CREATE POLICY store_settings_insert_managers
  ON public.store_settings FOR INSERT TO authenticated
  WITH CHECK (has_store_role(store_id, ARRAY['owner'::store_role, 'manager'::store_role]));
