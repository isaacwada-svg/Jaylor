-- Security fix L3 (High): audit_logs exists but has never received a row.
-- log_audit_event(p_store_id, p_action, p_entity, p_entity_id, p_metadata)
-- already exists and is already called from one place (privacy.tsx, granting
-- support access) — it is reused as-is here (not modified: its exact body
-- isn't something this migration needs to know, only its public contract),
-- called from new triggers so the sensitive actions the audit flagged are
-- captured automatically regardless of which code path performs them,
-- rather than depending on every future call site remembering to log.
--
-- Each trigger wraps its log_audit_event call in its own BEGIN/EXCEPTION
-- block: audit logging must never be able to block the underlying business
-- operation (a staff removal, a payout account update) if logging itself
-- hits an unexpected error.

-- ============================================================
-- 1. Role and membership changes
-- ============================================================

CREATE OR REPLACE FUNCTION public.audit_store_members_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      PERFORM public.log_audit_event(NEW.store_id, 'member_added', 'store_members', NEW.id,
        jsonb_build_object('user_id', NEW.user_id, 'role', NEW.role, 'status', NEW.status));
    ELSIF TG_OP = 'UPDATE' THEN
      IF NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status THEN
        PERFORM public.log_audit_event(NEW.store_id, 'member_updated', 'store_members', NEW.id,
          jsonb_build_object(
            'user_id', NEW.user_id,
            'from_role', OLD.role, 'to_role', NEW.role,
            'from_status', OLD.status, 'to_status', NEW.status
          ));
      END IF;
    ELSIF TG_OP = 'DELETE' THEN
      PERFORM public.log_audit_event(OLD.store_id, 'member_removed', 'store_members', OLD.id,
        jsonb_build_object('user_id', OLD.user_id, 'role', OLD.role));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS store_members_audit ON public.store_members;
CREATE TRIGGER store_members_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.store_members
  FOR EACH ROW EXECUTE FUNCTION public.audit_store_members_change();

-- ============================================================
-- 2. Payout account changes
-- ============================================================

CREATE OR REPLACE FUNCTION public.audit_payment_accounts_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      PERFORM public.log_audit_event(NEW.store_id, 'payout_account_added', 'payment_accounts', NEW.store_id,
        jsonb_build_object('provider', NEW.provider, 'bank_name', NEW.bank_name, 'status', NEW.status));
    ELSIF TG_OP = 'UPDATE' THEN
      PERFORM public.log_audit_event(NEW.store_id, 'payout_account_updated', 'payment_accounts', NEW.store_id,
        jsonb_build_object(
          'provider_changed', NEW.provider IS DISTINCT FROM OLD.provider,
          'bank_changed', NEW.bank_name IS DISTINCT FROM OLD.bank_name
            OR NEW.account_number IS DISTINCT FROM OLD.account_number
            OR NEW.bank_code IS DISTINCT FROM OLD.bank_code,
          'status_changed', NEW.status IS DISTINCT FROM OLD.status,
          'from_status', OLD.status, 'to_status', NEW.status
        ));
    ELSIF TG_OP = 'DELETE' THEN
      PERFORM public.log_audit_event(OLD.store_id, 'payout_account_removed', 'payment_accounts', OLD.store_id, '{}'::jsonb);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS payment_accounts_audit ON public.payment_accounts;
CREATE TRIGGER payment_accounts_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.payment_accounts
  FOR EACH ROW EXECUTE FUNCTION public.audit_payment_accounts_change();

-- ============================================================
-- 3. Support-grant issue/revoke
-- ============================================================

CREATE OR REPLACE FUNCTION public.audit_support_grants_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      PERFORM public.log_audit_event(NEW.store_id, 'support_access_granted', 'support_grants', NEW.id,
        jsonb_build_object('granted_by', NEW.granted_by, 'expires_at', NEW.expires_at));
    ELSIF TG_OP = 'UPDATE' AND NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL THEN
      PERFORM public.log_audit_event(NEW.store_id, 'support_access_revoked', 'support_grants', NEW.id,
        jsonb_build_object('revoked_at', NEW.revoked_at));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS support_grants_audit ON public.support_grants;
CREATE TRIGGER support_grants_audit
  AFTER INSERT OR UPDATE ON public.support_grants
  FOR EACH ROW EXECUTE FUNCTION public.audit_support_grants_change();

-- ============================================================
-- 4. Client and order deletion
-- ============================================================

CREATE OR REPLACE FUNCTION public.audit_clients_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.log_audit_event(OLD.store_id, 'client_deleted', 'clients', OLD.id,
      jsonb_build_object('full_name', OLD.full_name, 'phone', OLD.phone));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS clients_delete_audit ON public.clients;
CREATE TRIGGER clients_delete_audit
  AFTER DELETE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.audit_clients_delete();

CREATE OR REPLACE FUNCTION public.audit_orders_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.log_audit_event(OLD.store_id, 'order_deleted', 'orders', OLD.id,
      jsonb_build_object('number', OLD.number, 'client_id', OLD.client_id, 'status', OLD.status));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS orders_delete_audit ON public.orders;
CREATE TRIGGER orders_delete_audit
  AFTER DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.audit_orders_delete();

-- ============================================================
-- 5. Plan changes (complements the L1 blocking trigger: this one
--    fires AFTER a legitimate service_role/platform-admin plan change
--    goes through, logging it rather than blocking it)
-- ============================================================

CREATE OR REPLACE FUNCTION public.audit_stores_plan_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.plan_code IS DISTINCT FROM OLD.plan_code THEN
    BEGIN
      PERFORM public.log_audit_event(NEW.id, 'plan_changed', 'stores', NEW.id,
        jsonb_build_object('from_plan', OLD.plan_code, 'to_plan', NEW.plan_code));
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stores_plan_change_audit ON public.stores;
CREATE TRIGGER stores_plan_change_audit
  AFTER UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.audit_stores_plan_change();
