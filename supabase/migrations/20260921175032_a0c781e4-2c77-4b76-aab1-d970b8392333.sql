
ALTER FUNCTION public.easter_date(integer) SET search_path = public;
ALTER FUNCTION public.islamic_to_gregorian(integer, integer, integer) SET search_path = public;
ALTER FUNCTION public.next_islamic_event(integer, integer, date) SET search_path = public;
ALTER FUNCTION public.nth_weekday_date(integer, integer, integer, integer) SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.check_rls_drift() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.prevent_unauthorized_stores_update() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS store_members_insert_managers ON public.store_members;
CREATE POLICY store_members_insert_managers ON public.store_members
  FOR INSERT TO authenticated
  WITH CHECK (
    has_store_role(store_id, ARRAY['owner'::store_role])
    OR (has_store_role(store_id, ARRAY['manager'::store_role]) AND role = 'tailor'::store_role)
  );

DROP POLICY IF EXISTS store_members_update_managers ON public.store_members;
CREATE POLICY store_members_update_managers ON public.store_members
  FOR UPDATE TO authenticated
  USING (
    has_store_role(store_id, ARRAY['owner'::store_role])
    OR (has_store_role(store_id, ARRAY['manager'::store_role]) AND role = 'tailor'::store_role)
  )
  WITH CHECK (
    has_store_role(store_id, ARRAY['owner'::store_role])
    OR (has_store_role(store_id, ARRAY['manager'::store_role]) AND role = 'tailor'::store_role)
  );
