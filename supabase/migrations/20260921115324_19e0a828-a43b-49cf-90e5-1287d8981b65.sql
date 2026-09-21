CREATE OR REPLACE FUNCTION public.is_store_member(_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.store_members m
    WHERE m.store_id = _store_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
  );
$function$;

CREATE OR REPLACE FUNCTION public.has_store_role(_store_id uuid, _roles store_role[])
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.store_members m
    WHERE m.store_id = _store_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
      AND m.role = ANY(_roles)
  );
$function$;

CREATE POLICY "measurement_sets_update_managers"
ON public.measurement_sets
FOR UPDATE
TO authenticated
USING (public.has_store_role(store_id, ARRAY['owner'::store_role, 'manager'::store_role]))
WITH CHECK (public.has_store_role(store_id, ARRAY['owner'::store_role, 'manager'::store_role]));

CREATE POLICY "measurement_sets_delete_managers"
ON public.measurement_sets
FOR DELETE
TO authenticated
USING (public.has_store_role(store_id, ARRAY['owner'::store_role, 'manager'::store_role]));

CREATE OR REPLACE FUNCTION public.check_feature_limit(p_store_id uuid, p_feature text, p_quantity integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan_code text;
  v_limit jsonb;
  v_limit_num numeric;
  v_used numeric;
  v_allowed boolean;
  v_required_plan text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_store_member(p_store_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_feature IS NULL OR length(p_feature) = 0 OR length(p_feature) > 64 THEN
    RAISE EXCEPTION 'Invalid feature' USING ERRCODE = '22023';
  END IF;

  BEGIN
    SELECT public.effective_plan_code(p_store_id) INTO v_plan_code;
  EXCEPTION WHEN OTHERS THEN
    SELECT CASE WHEN trial_ends_at IS NOT NULL AND trial_ends_at > now() THEN 'growth' ELSE plan_code END
      INTO v_plan_code
      FROM public.stores WHERE id = p_store_id;
  END;

  IF v_plan_code IS NULL THEN
    RAISE EXCEPTION 'Store not found';
  END IF;

  SELECT limits -> p_feature INTO v_limit FROM public.plans WHERE code = v_plan_code;

  IF p_feature = 'storefront_items' THEN
    SELECT count(*) INTO v_used FROM public.storefront_items WHERE store_id = p_store_id;
  ELSIF p_feature = 'users' THEN
    SELECT count(*) INTO v_used FROM public.store_members WHERE store_id = p_store_id AND status = 'active';
  ELSE
    SELECT COALESCE(used, 0) INTO v_used
      FROM public.feature_usage_counters
      WHERE store_id = p_store_id AND feature_key = p_feature AND period_month = date_trunc('month', now())::date;
    v_used := COALESCE(v_used, 0);
  END IF;

  IF v_limit IS NULL OR v_limit = 'null'::jsonb THEN
    v_allowed := true;
    v_limit_num := NULL;
  ELSE
    v_limit_num := (v_limit)::text::numeric;
    v_allowed := (v_used + p_quantity) <= v_limit_num;
  END IF;

  IF NOT v_allowed THEN
    SELECT code INTO v_required_plan
    FROM public.plans
    WHERE code != v_plan_code
      AND (limits -> p_feature IS NULL OR limits -> p_feature = 'null'::jsonb
           OR (limits -> p_feature)::text::numeric >= (v_used + p_quantity))
    ORDER BY sort_order ASC
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'limit', CASE WHEN v_limit IS NULL OR v_limit = 'null'::jsonb THEN NULL
                  WHEN v_limit_num = 0 THEN to_jsonb(false)
                  ELSE to_jsonb(v_limit_num) END,
    'used', v_used,
    'plan', v_plan_code,
    'required_plan', v_required_plan
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.check_feature_limit(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_feature_limit(uuid, text, integer) TO authenticated, service_role;