-- L3: audit triggers
CREATE OR REPLACE FUNCTION public.audit_store_members_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      PERFORM public.log_audit_event(NEW.store_id, 'member_added', 'store_members', NEW.id,
        jsonb_build_object('user_id', NEW.user_id, 'role', NEW.role, 'status', NEW.status));
    ELSIF TG_OP = 'UPDATE' THEN
      IF NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status THEN
        PERFORM public.log_audit_event(NEW.store_id, 'member_updated', 'store_members', NEW.id,
          jsonb_build_object('user_id', NEW.user_id, 'from_role', OLD.role, 'to_role', NEW.role,
            'from_status', OLD.status, 'to_status', NEW.status));
      END IF;
    ELSIF TG_OP = 'DELETE' THEN
      PERFORM public.log_audit_event(OLD.store_id, 'member_removed', 'store_members', OLD.id,
        jsonb_build_object('user_id', OLD.user_id, 'role', OLD.role));
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS store_members_audit ON public.store_members;
CREATE TRIGGER store_members_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.store_members
  FOR EACH ROW EXECUTE FUNCTION public.audit_store_members_change();

CREATE OR REPLACE FUNCTION public.audit_payment_accounts_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
          'from_status', OLD.status, 'to_status', NEW.status));
    ELSIF TG_OP = 'DELETE' THEN
      PERFORM public.log_audit_event(OLD.store_id, 'payout_account_removed', 'payment_accounts', OLD.store_id, '{}'::jsonb);
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS payment_accounts_audit ON public.payment_accounts;
CREATE TRIGGER payment_accounts_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.payment_accounts
  FOR EACH ROW EXECUTE FUNCTION public.audit_payment_accounts_change();

CREATE OR REPLACE FUNCTION public.audit_support_grants_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      PERFORM public.log_audit_event(NEW.store_id, 'support_access_granted', 'support_grants', NEW.id,
        jsonb_build_object('granted_by', NEW.granted_by, 'expires_at', NEW.expires_at));
    ELSIF TG_OP = 'UPDATE' AND NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL THEN
      PERFORM public.log_audit_event(NEW.store_id, 'support_access_revoked', 'support_grants', NEW.id,
        jsonb_build_object('revoked_at', NEW.revoked_at));
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS support_grants_audit ON public.support_grants;
CREATE TRIGGER support_grants_audit
  AFTER INSERT OR UPDATE ON public.support_grants
  FOR EACH ROW EXECUTE FUNCTION public.audit_support_grants_change();

CREATE OR REPLACE FUNCTION public.audit_clients_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    PERFORM public.log_audit_event(OLD.store_id, 'client_deleted', 'clients', OLD.id,
      jsonb_build_object('full_name', OLD.full_name, 'phone', OLD.phone));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS clients_delete_audit ON public.clients;
CREATE TRIGGER clients_delete_audit
  AFTER DELETE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.audit_clients_delete();

CREATE OR REPLACE FUNCTION public.audit_orders_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    PERFORM public.log_audit_event(OLD.store_id, 'order_deleted', 'orders', OLD.id,
      jsonb_build_object('number', OLD.number, 'client_id', OLD.client_id, 'status', OLD.status));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS orders_delete_audit ON public.orders;
CREATE TRIGGER orders_delete_audit
  AFTER DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.audit_orders_delete();

CREATE OR REPLACE FUNCTION public.audit_stores_plan_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.plan_code IS DISTINCT FROM OLD.plan_code THEN
    BEGIN
      PERFORM public.log_audit_event(NEW.id, 'plan_changed', 'stores', NEW.id,
        jsonb_build_object('from_plan', OLD.plan_code, 'to_plan', NEW.plan_code));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stores_plan_change_audit ON public.stores;
CREATE TRIGGER stores_plan_change_audit
  AFTER UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.audit_stores_plan_change();

-- L4: payout account history + cooldown
CREATE TABLE IF NOT EXISTS public.payment_account_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid,
  old_provider text, old_bank_code text, old_bank_name text,
  old_account_number text, old_account_name text, old_status text,
  new_provider text, new_bank_code text, new_bank_name text,
  new_account_number text, new_account_name text, new_status text
);

REVOKE ALL ON public.payment_account_changes FROM anon, authenticated;
GRANT SELECT ON public.payment_account_changes TO authenticated;
GRANT ALL ON public.payment_account_changes TO service_role;

ALTER TABLE public.payment_account_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_account_changes_owner_read ON public.payment_account_changes;
CREATE POLICY payment_account_changes_owner_read
  ON public.payment_account_changes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.guard_payment_account_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_last_change timestamptz;
  v_cooldown interval := interval '24 hours';
BEGIN
  SELECT max(changed_at) INTO v_last_change
  FROM public.payment_account_changes WHERE store_id = NEW.store_id;

  IF v_last_change IS NOT NULL AND now() - v_last_change < v_cooldown THEN
    RAISE EXCEPTION 'This store''s payout account was changed less than 24 hours ago. For security, please wait before changing it again, or contact support for an emergency override.'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.payment_account_changes (
    store_id, changed_by,
    old_provider, old_bank_code, old_bank_name, old_account_number, old_account_name, old_status,
    new_provider, new_bank_code, new_bank_name, new_account_number, new_account_name, new_status
  ) VALUES (
    NEW.store_id, auth.uid(),
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.provider END,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.bank_code END,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.bank_name END,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.account_number END,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.account_name END,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END,
    NEW.provider, NEW.bank_code, NEW.bank_name, NEW.account_number, NEW.account_name, NEW.status
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_accounts_guard ON public.payment_accounts;
CREATE TRIGGER payment_accounts_guard
  BEFORE INSERT OR UPDATE ON public.payment_accounts
  FOR EACH ROW EXECUTE FUNCTION public.guard_payment_account_change();

-- L6: drop legacy sew_requests policies
DROP POLICY IF EXISTS "Anyone can submit a sew request" ON public.sew_requests;
DROP POLICY IF EXISTS "Store members update sew requests" ON public.sew_requests;

-- L8: rate limit leads
CREATE OR REPLACE FUNCTION public.enforce_lead_rate_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_key text := COALESCE(NEW.phone, NEW.email, NEW.name);
BEGIN
  IF v_key IS NOT NULL AND NOT COALESCE((SELECT public.check_rate_limit('leads', v_key, 5, 60)), true) THEN
    RAISE EXCEPTION 'Too many submissions. Please try again later.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_rate_limit ON public.leads;
CREATE TRIGGER leads_rate_limit
  BEFORE INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.enforce_lead_rate_limit();

-- L9: tighten policy roles
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('expenses','measurement_passports','measurement_passport_shares',
        'message_topups','order_payment_links','payment_accounts','platform_admins',
        'referral_rewards','store_invites','store_monthly_snapshots','support_grants')
      AND roles = ARRAY['public']::name[]
  LOOP
    EXECUTE format('ALTER POLICY %I ON %I.%I TO authenticated', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.audit_store_members_change(), public.audit_payment_accounts_change(),
  public.audit_support_grants_change(), public.audit_clients_delete(), public.audit_orders_delete(),
  public.audit_stores_plan_change(), public.guard_payment_account_change(), public.enforce_lead_rate_limit()
  FROM PUBLIC, anon, authenticated;