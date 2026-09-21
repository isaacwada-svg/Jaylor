-- Security fix L5 (Medium): check_feature_limit had no membership guard,
-- so any signed-in user could call check_feature_limit('<any other store
-- id>', 'orders') and read that store's plan code, numeric allowance,
-- current usage and required-upgrade plan — read-only, but crossing the
-- tenant boundary. feature_usage already has the correct guard
-- (IF auth.uid() IS NULL OR NOT public.is_store_member(p_store_id) THEN
-- RAISE EXCEPTION ...); this adds the same pattern here.
--
-- The rest of the function body below is reproduced verbatim from the live
-- pg_get_functiondef capture recorded in SECURITY_AUDIT.md (L5) at the time
-- of the audit — nothing else about its logic is changed, including the
-- two secondary issues noted there (an unknown p_feature reads as
-- allowed=true rather than failing closed; the EXCEPTION WHEN OTHERS
-- fallback masks a genuine error inside effective_plan_code) — those are
-- left alone since they're both existing behavioural quirks, not the
-- security gap this fix closes.

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
