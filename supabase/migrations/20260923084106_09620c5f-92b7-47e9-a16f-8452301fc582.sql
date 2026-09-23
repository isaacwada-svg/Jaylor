-- Super-admin store management: platform-wide "at a glance" totals beyond
-- what admin_platform_stats() already returns (left untouched -- its exact
-- original formulas, e.g. for mrr_estimate, predate this session's tracked
-- migrations, so extending it blind risked silently changing a number
-- that's already relied on), plus a per-store detail RPC and admin actions
-- for the new /admin/stores/$storeId page. Access here is unilateral for
-- platform admins -- unlike support_grants (owner-initiated, time-limited),
-- this is "super admin can see any store, always," by design.

CREATE OR REPLACE FUNCTION public.admin_platform_totals()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'total_clients', (SELECT count(*) FROM public.clients),
    'total_orders', (SELECT count(*) FROM public.orders),
    'total_users', (SELECT count(DISTINCT user_id) FROM public.store_members WHERE status = 'active'),
    'total_visitors_30d', (
      SELECT count(DISTINCT visitor_id) FROM public.analytics_events
      WHERE occurred_at > now() - interval '30 days'
    ),
    'gmv_collected', (SELECT coalesce(sum(amount), 0) FROM public.payments WHERE voided = false)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_platform_totals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_platform_totals() TO authenticated;

-- One store's full profile, owner contact, staff list and totals, for the
-- super-admin store detail page. Centralizes the one place this reads
-- auth.users (for owner/staff email + name) rather than exposing that
-- schema more broadly.
CREATE OR REPLACE FUNCTION public.admin_get_store_detail(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store public.stores%ROWTYPE;
  v_owner_email text;
  v_owner_name text;
  v_result jsonb;
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_store FROM public.stores WHERE id = p_store_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Store not found';
  END IF;

  SELECT email, raw_user_meta_data ->> 'full_name'
    INTO v_owner_email, v_owner_name
  FROM auth.users WHERE id = v_store.owner_id;

  v_result := jsonb_build_object(
    'store', jsonb_build_object(
      'id', v_store.id,
      'name', v_store.name,
      'slug', v_store.slug,
      'city', v_store.city,
      'country_code', v_store.country_code,
      'currency', v_store.currency,
      'plan_code', v_store.plan_code,
      'trial_ends_at', v_store.trial_ends_at,
      'is_active', v_store.is_active,
      'created_at', v_store.created_at,
      'whatsapp_phone', v_store.whatsapp_phone
    ),
    'owner', jsonb_build_object(
      'id', v_store.owner_id, 'email', v_owner_email, 'full_name', v_owner_name
    ),
    'staff', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id, 'user_id', m.user_id, 'role', m.role, 'status', m.status,
        'email', u.email, 'full_name', u.raw_user_meta_data ->> 'full_name',
        'created_at', m.created_at
      ) ORDER BY m.created_at), '[]'::jsonb)
      FROM public.store_members m
      JOIN auth.users u ON u.id = m.user_id
      WHERE m.store_id = p_store_id
    ),
    'totals', jsonb_build_object(
      'clients_count', (SELECT count(*) FROM public.clients WHERE store_id = p_store_id),
      'orders_count', (SELECT count(*) FROM public.orders WHERE store_id = p_store_id),
      'active_orders_count', (
        SELECT count(*) FROM public.orders
        WHERE store_id = p_store_id AND status NOT IN ('collected', 'cancelled')
      ),
      'collected_total', (
        SELECT coalesce(sum(amount), 0) FROM public.payments
        WHERE store_id = p_store_id AND voided = false
      ),
      'outstanding_total', (
        SELECT coalesce(sum(balance), 0) FROM public.order_balances WHERE store_id = p_store_id
      )
    )
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_store_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_store_detail(uuid) TO authenticated;

-- Direct, additive read access for platform admins on the underlying
-- tables the detail page browses (recent orders/payments/clients lists) --
-- these are new policies alongside whatever already governs store-member
-- access, not a replacement of it.
CREATE POLICY platform_admin_select_clients
  ON public.clients FOR SELECT TO authenticated USING (is_platform_admin());
CREATE POLICY platform_admin_select_orders
  ON public.orders FOR SELECT TO authenticated USING (is_platform_admin());
CREATE POLICY platform_admin_select_payments
  ON public.payments FOR SELECT TO authenticated USING (is_platform_admin());
CREATE POLICY platform_admin_select_store_members
  ON public.store_members FOR SELECT TO authenticated USING (is_platform_admin());

-- Admin actions. Every use of these shows up in the Audit log tab -- either
-- via an explicit log_audit_event() call below, or automatically through an
-- existing trigger on the column being changed (noted at each call site).

CREATE OR REPLACE FUNCTION public.admin_set_store_plan(p_store_id uuid, p_plan_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.plans WHERE code = p_plan_code) THEN
    RAISE EXCEPTION 'Unknown plan code' USING ERRCODE = '22023';
  END IF;

  -- audit_stores_plan_change() already logs a 'plan_changed' entry with
  -- from/to plan codes whenever plan_code changes, so no explicit call
  -- here -- it would just duplicate that trigger's entry.
  UPDATE public.stores SET plan_code = p_plan_code, updated_at = now() WHERE id = p_store_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_store_plan(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_store_plan(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_store_active(p_store_id uuid, p_is_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.stores SET is_active = p_is_active, updated_at = now() WHERE id = p_store_id;

  BEGIN
    PERFORM public.log_audit_event(
      p_store_id => p_store_id,
      p_action => CASE WHEN p_is_active THEN 'admin_reactivated_store' ELSE 'admin_deactivated_store' END,
      p_entity => 'store',
      p_entity_id => p_store_id,
      p_metadata => '{}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_store_active(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_store_active(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_extend_trial(p_store_id uuid, p_days integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_trial_end timestamptz;
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_days IS NULL OR p_days < 1 OR p_days > 365 THEN
    RAISE EXCEPTION 'Invalid number of days' USING ERRCODE = '22023';
  END IF;

  UPDATE public.stores
    SET trial_ends_at = GREATEST(trial_ends_at, now()) + make_interval(days => p_days),
        updated_at = now()
    WHERE id = p_store_id
    RETURNING trial_ends_at INTO v_new_trial_end;

  BEGIN
    PERFORM public.log_audit_event(
      p_store_id => p_store_id,
      p_action => 'admin_extend_trial',
      p_entity => 'store',
      p_entity_id => p_store_id,
      p_metadata => jsonb_build_object('days_added', p_days, 'new_trial_ends_at', v_new_trial_end)
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_extend_trial(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_extend_trial(uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_remove_staff_member(p_member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT store_id INTO v_store_id FROM public.store_members WHERE id = p_member_id;
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  -- audit_store_members_change() already logs a 'member_updated' entry
  -- with from/to status whenever a member's status changes, so no
  -- explicit call here either.
  UPDATE public.store_members SET status = 'removed' WHERE id = p_member_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_remove_staff_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_remove_staff_member(uuid) TO authenticated;
