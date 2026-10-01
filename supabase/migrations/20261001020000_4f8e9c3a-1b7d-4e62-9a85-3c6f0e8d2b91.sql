-- Platform admin: hard-delete a store, and hard-delete a user (cascading to
-- any store they own). Requested directly by the super admin after the
-- anon-grant drift fix, as a genuine permanent-removal action distinct from
-- the existing "Deactivate store" (soft, reversible) and "Remove" (status =
-- 'removed' on store_members, soft) actions already on this page.
--
-- Both are super_admin only (not admin/support) given the blast radius, and
-- both are logged to audit_logs with store_id = NULL rather than the
-- deleted store's own id -- audit_logs.store_id is ON DELETE CASCADE from
-- stores, so a row pointing at the store being deleted would vanish with it
-- one statement later, erasing the only record that the deletion happened.
-- The store/user's identifying details go into the entry's metadata jsonb
-- instead, so the entry survives and stays readable.
--
-- admin_delete_store() explicitly clears nine tables whose store_id foreign
-- key has delete_rule = NO ACTION (confirmed live against this project's
-- schema: fitting_links, inventory_items, inventory_movements, pay_rates,
-- payroll_lines, payroll_runs, staff_advances, staff_earnings,
-- store_closed_dates) before deleting the stores row -- every other
-- store-scoped table (clients, orders, payments, measurement_sets, etc.)
-- already cascades. Deletion order among those nine matters where one has
-- its own (non-store_id) foreign key into another: inventory_movements
-- before inventory_items, payroll_lines before payroll_runs.
--
-- admin_delete_user_data() only reaches as far as public.profiles -- it
-- does not touch auth.users. No table in this project has a foreign key
-- constraint into auth.users(id) (confirmed live: a query for FKs
-- referencing auth.users(id) returned zero rows), and raw SQL access to the
-- auth schema's own internal bookkeeping (sessions, identities, MFA
-- factors) isn't something a migration should assume. The calling edge
-- function (admin-delete-user) calls this RPC first for everything in the
-- public schema, then finishes with supabase.auth.admin.deleteUser(), the
-- officially supported way to remove an auth user and everything GoTrue
-- itself manages.

CREATE OR REPLACE FUNCTION public.admin_delete_store(p_store_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_store public.stores%ROWTYPE;
  v_owner_email text;
BEGIN
  SELECT role INTO v_caller_role FROM public.platform_admins WHERE user_id = auth.uid();
  IF v_caller_role IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'Only a super admin can delete a store' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_store FROM public.stores WHERE id = p_store_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Store not found';
  END IF;

  SELECT email INTO v_owner_email FROM auth.users WHERE id = v_store.owner_id;

  DELETE FROM public.fitting_links WHERE store_id = p_store_id;
  DELETE FROM public.inventory_movements WHERE store_id = p_store_id;
  DELETE FROM public.inventory_items WHERE store_id = p_store_id;
  DELETE FROM public.payroll_lines WHERE store_id = p_store_id;
  DELETE FROM public.payroll_runs WHERE store_id = p_store_id;
  DELETE FROM public.staff_advances WHERE store_id = p_store_id;
  DELETE FROM public.staff_earnings WHERE store_id = p_store_id;
  DELETE FROM public.pay_rates WHERE store_id = p_store_id;
  DELETE FROM public.store_closed_dates WHERE store_id = p_store_id;

  BEGIN
    PERFORM public.log_audit_event(
      NULL,
      'admin_deleted_store',
      'store',
      p_store_id,
      jsonb_build_object(
        'store_name', v_store.name,
        'store_slug', v_store.slug,
        'owner_email', v_owner_email,
        'reason', p_reason
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  DELETE FROM public.stores WHERE id = p_store_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_store(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_store(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_user_data(p_user_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_email text;
  v_full_name text;
  v_store_id uuid;
BEGIN
  SELECT role INTO v_caller_role FROM public.platform_admins WHERE user_id = auth.uid();
  IF v_caller_role IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'Only a super admin can delete a user' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'Remove this person from the platform team before deleting their account';
  END IF;

  SELECT email, raw_user_meta_data ->> 'full_name'
    INTO v_email, v_full_name
  FROM auth.users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Every store always has an owner; there is no "orphaned store" state,
  -- so a store this person owns is deleted outright, same as the explicit
  -- admin_delete_store() action, rather than left ownerless.
  FOR v_store_id IN SELECT id FROM public.stores WHERE owner_id = p_user_id LOOP
    PERFORM public.admin_delete_store(v_store_id, coalesce(p_reason, 'Owner account deleted'));
  END LOOP;

  -- Staff/manager memberships at stores this person doesn't own -- those
  -- stores aren't touched, just this person's membership in them.
  DELETE FROM public.store_members WHERE user_id = p_user_id;
  DELETE FROM public.profiles WHERE id = p_user_id;

  BEGIN
    PERFORM public.log_audit_event(
      NULL,
      'admin_deleted_user',
      'user',
      p_user_id,
      jsonb_build_object('email', v_email, 'full_name', v_full_name, 'reason', p_reason)
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user_data(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_data(uuid, text) TO authenticated;
