
-- 1. Revoke execute on elevated functions that no application code calls
REVOKE ALL ON FUNCTION public.admin_set_calendar_override(text, integer, date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_store_calendar_override(uuid, text, integer, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_calendar_override(text, integer, date, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_store_calendar_override(uuid, text, integer, date, date) TO service_role;

-- 2. Remove blanket PUBLIC execute from every SECURITY DEFINER function in public schema
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
  END LOOP;
END $$;

-- keep the intentional unguessable-token guest flows callable
GRANT EXECUTE ON FUNCTION public.get_invite_by_token(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_participant_by_token(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_participant_style(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_participant_measurement_choice(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_participant_fabric_photo(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_participant_measurements(uuid, jsonb, text) TO anon, authenticated;

-- 3. Managers may only modify tailor rows; owners/managers rows are owner-only
DROP POLICY IF EXISTS store_members_update_managers ON public.store_members;
CREATE POLICY store_members_update_managers
ON public.store_members
FOR UPDATE
TO authenticated
USING (
  has_store_role(store_id, ARRAY['owner'::store_role])
  OR (
    has_store_role(store_id, ARRAY['manager'::store_role])
    AND role = 'tailor'::store_role
    AND NOT EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_members.store_id AND s.owner_id = store_members.user_id
    )
  )
)
WITH CHECK (
  has_store_role(store_id, ARRAY['owner'::store_role])
  OR (
    has_store_role(store_id, ARRAY['manager'::store_role])
    AND role = 'tailor'::store_role
    AND NOT EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_members.store_id AND s.owner_id = store_members.user_id
    )
  )
);
