ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rate_limit_hits FROM anon, authenticated;
GRANT ALL ON TABLE public.rate_limit_hits TO service_role;

ALTER VIEW public.stores_public SET (security_invoker = true);

ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.jt_field(text, text, integer, numeric, numeric) SET search_path = public;
ALTER FUNCTION public.set_measurement_version() SET search_path = public;
ALTER FUNCTION public.set_order_timestamps() SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.admin_list_stores() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_stores() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_platform_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_platform_stats() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.enforce_consultation_request_rate_limit() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_consultation_request_rate_limit() TO service_role;
REVOKE EXECUTE ON FUNCTION public.enforce_sew_request_rate_limit() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_sew_request_rate_limit() TO service_role;
REVOKE EXECUTE ON FUNCTION public.log_order_status_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_order_status_change() TO service_role;
REVOKE EXECUTE ON FUNCTION public.restrict_tailor_order_update() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restrict_tailor_order_update() TO service_role;
REVOKE EXECUTE ON FUNCTION public.set_order_number() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_order_number() TO service_role;
REVOKE EXECUTE ON FUNCTION public.track_message_usage() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.track_message_usage() TO service_role;
REVOKE EXECUTE ON FUNCTION public.track_order_usage() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.track_order_usage() TO service_role;

REVOKE EXECUTE ON FUNCTION public.log_audit_event(uuid, text, text, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_audit_event(uuid, text, text, uuid, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.feature_usage(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.feature_usage(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.has_active_support_grant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_support_grant(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_usage_counter(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_usage_counter(uuid, text) TO authenticated;