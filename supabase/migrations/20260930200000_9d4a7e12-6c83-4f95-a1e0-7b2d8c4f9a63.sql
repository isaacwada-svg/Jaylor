-- PR M: Local languages, part 2 (the tailor's own app screens).
--
-- Adds profiles.ui_language -- the signed-in user's own app language,
-- per-user (not per-store: stores.language from PR L stays the language
-- shown to that shop's CLIENTS and is untouched here).
--
-- The `profiles` table itself, and however its row gets created on signup,
-- are not tracked in this repo's migration history (same situation PR L hit
-- with get_participant_by_token/stores_public) -- rather than guess at or
-- redefine whatever untracked trigger/RLS policy exists there, this only
-- adds a new column plus one new, narrowly-scoped SECURITY DEFINER function
-- that lets a signed-in user set their OWN ui_language. That function works
-- regardless of whatever RLS is (or isn't) already configured on `profiles`,
-- and it can never touch any row but the caller's own.
--
-- Safe to run more than once.

BEGIN;

-- 1. The one new column this PR is keyed on.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ui_language text;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_ui_language_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_ui_language_check
  CHECK (ui_language IS NULL OR ui_language IN ('en', 'pcm', 'ha', 'yo', 'ig'));

-- 2. Let a signed-in user set only their own ui_language, independent of
--    whatever UPDATE policy (if any) already exists on public.profiles.
CREATE OR REPLACE FUNCTION public.set_my_ui_language(p_language text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_language NOT IN ('en', 'pcm', 'ha', 'yo', 'ig') THEN
    RAISE EXCEPTION 'Invalid language code: %', p_language;
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  UPDATE public.profiles
  SET ui_language = p_language, updated_at = now()
  WHERE id = auth.uid();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_my_ui_language(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_ui_language(text) TO authenticated;

-- 3. Verification -- one row: all_true, and which checks (if any) failed.
SELECT
  bool_and(v) AS all_true,
  coalesce(string_agg(k, ', ') FILTER (WHERE NOT v), 'none') AS failed_checks
FROM (VALUES
  ('profiles_ui_language_column', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'ui_language'
  )),
  ('set_my_ui_language_fn', to_regprocedure('public.set_my_ui_language(text)') IS NOT NULL)
) AS checks(k, v);

COMMIT;
