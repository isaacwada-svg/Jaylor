-- 1. Private AI design photo bucket: members-only reads, no client uploads.
DROP POLICY IF EXISTS ai_design_photos_public_read ON storage.objects;
DROP POLICY IF EXISTS ai_design_photos_public_insert ON storage.objects;

CREATE POLICY ai_design_photos_member_read
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'ai-design-photos'
    AND is_store_member((split_part(name, '/', 1))::uuid)
  );

-- 2. app_settings is internal configuration: platform admins only.
DROP POLICY IF EXISTS app_settings_read ON public.app_settings;

CREATE POLICY app_settings_admin_read
  ON public.app_settings FOR SELECT
  TO authenticated
  USING (is_platform_admin());

-- 3. Trim SECURITY DEFINER execute grants to only the callers that need them.
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.accept_invite(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_design_by_token(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_use_feature(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.effective_plan_code(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_active_support_grant(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_usage_counter(uuid, text) FROM PUBLIC, anon, authenticated;