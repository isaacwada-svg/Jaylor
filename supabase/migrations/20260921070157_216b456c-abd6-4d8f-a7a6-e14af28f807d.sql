CREATE OR REPLACE FUNCTION public.feature_usage(p_store_id uuid, p_feature text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_code text;
  v_trial_ends timestamptz;
  v_limit_json jsonb;
  v_used numeric := 0;
  v_month text := to_char(now() AT TIME ZONE 'Africa/Lagos', 'YYYY-MM');
  v_allowed boolean;
  v_required_plan text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_store_member(p_store_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_feature NOT IN ('orders', 'messages', 'ai_scan', 'ai_preview', 'voice_orders', 'clients', 'staff', 'reports', 'storefront', 'events', 'consultations', 'contracts', 'measurement_passports') THEN
    RAISE EXCEPTION 'Unsupported feature' USING ERRCODE = '22023';
  END IF;

  SELECT trial_ends_at, plan_code INTO v_trial_ends, v_plan_code
  FROM public.stores
  WHERE id = p_store_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Store not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_trial_ends IS NOT NULL AND v_trial_ends > now() THEN
    v_plan_code := 'growth';
  END IF;

  SELECT limits -> p_feature INTO v_limit_json
  FROM public.plans
  WHERE code = v_plan_code;

  IF p_feature IN ('orders', 'messages', 'ai_scan', 'ai_preview', 'voice_orders') THEN
    SELECT coalesce(
      CASE p_feature
        WHEN 'orders' THEN orders
        WHEN 'messages' THEN messages
        WHEN 'ai_scan' THEN ai_scans
        WHEN 'ai_preview' THEN ai_previews
        WHEN 'voice_orders' THEN voice_orders
      END, 0)
    INTO v_used
    FROM public.usage_counters
    WHERE store_id = p_store_id AND month = v_month;
  END IF;

  IF v_limit_json IS NULL THEN
    v_allowed := true;
  ELSIF jsonb_typeof(v_limit_json) = 'boolean' THEN
    v_allowed := (v_limit_json #>> '{}')::boolean;
  ELSIF jsonb_typeof(v_limit_json) = 'number' THEN
    v_allowed := (v_limit_json #>> '{}')::numeric < 0
      OR v_used < (v_limit_json #>> '{}')::numeric;
  ELSE
    v_allowed := true;
  END IF;

  SELECT p.code INTO v_required_plan
  FROM public.plans p
  WHERE (
    jsonb_typeof(p.limits -> p_feature) = 'boolean'
    AND (p.limits -> p_feature #>> '{}')::boolean
  ) OR (
    jsonb_typeof(p.limits -> p_feature) = 'number'
    AND ((p.limits -> p_feature #>> '{}')::numeric < 0
      OR v_used < (p.limits -> p_feature #>> '{}')::numeric)
  )
  ORDER BY p.sort_order ASC
  LIMIT 1;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'limit', v_limit_json,
    'used', v_used,
    'plan', v_plan_code,
    'required_plan', v_required_plan
  );
END;
$$;

REVOKE ALL ON FUNCTION public.feature_usage(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.feature_usage(uuid, text) TO authenticated, service_role;