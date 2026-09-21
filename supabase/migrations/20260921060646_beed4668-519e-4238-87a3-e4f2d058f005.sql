
-- 1. Prevent privilege escalation on store_members
DROP POLICY IF EXISTS store_members_insert_managers ON public.store_members;
DROP POLICY IF EXISTS store_members_update_managers ON public.store_members;

CREATE POLICY store_members_insert_managers
  ON public.store_members FOR INSERT TO authenticated
  WITH CHECK (
    (
      has_store_role(store_id, ARRAY['owner'::store_role, 'manager'::store_role])
      AND role <> 'owner'::store_role
    )
    OR has_store_role(store_id, ARRAY['owner'::store_role])
  );

CREATE POLICY store_members_update_managers
  ON public.store_members FOR UPDATE TO authenticated
  USING (
    has_store_role(store_id, ARRAY['owner'::store_role])
    OR (
      has_store_role(store_id, ARRAY['manager'::store_role])
      AND role <> 'owner'::store_role
    )
  )
  WITH CHECK (
    has_store_role(store_id, ARRAY['owner'::store_role])
    OR (
      has_store_role(store_id, ARRAY['manager'::store_role])
      AND role <> 'owner'::store_role
    )
  );

-- 2. Public store exposure: ensure anon only ever reads storefront-safe columns
REVOKE SELECT ON public.stores FROM anon;
GRANT SELECT (id, name, slug, logo_url, accent_color, city, cover_url, bio, whatsapp_phone, opening_hours, is_active)
  ON public.stores TO anon;

-- 3. Phone -> login email lookup must not be callable from the browser
REVOKE EXECUTE ON FUNCTION public.resolve_login_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_login_email(text) TO service_role;
