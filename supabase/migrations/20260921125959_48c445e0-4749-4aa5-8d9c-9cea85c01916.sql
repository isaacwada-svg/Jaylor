-- Security fix L1 (Critical): a store owner could self-escalate plan_code,
-- trial_ends_at, is_active, owner_id, referral_code, referred_by_store_id,
-- country_code or currency via a plain UPDATE on stores, since the RLS
-- policy only checks row ownership, not which columns changed. This
-- BEFORE UPDATE trigger blocks writes to those columns unless the caller
-- is service_role or a platform admin.
--
-- The guard conditions are wrapped in COALESCE(..., false): auth.role()
-- returns NULL (not a non-matching string) whenever there is no JWT
-- context at all (e.g. a direct admin SQL session), and NULL propagates
-- through OR/NOT into the IF condition, which plpgsql treats as "not
-- true" — silently skipping the RAISE and allowing the write through.
-- COALESCE forces an unknown caller to fail closed instead.
CREATE OR REPLACE FUNCTION public.prevent_unauthorized_stores_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (
    NEW.plan_code IS DISTINCT FROM OLD.plan_code OR
    NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at OR
    NEW.is_active IS DISTINCT FROM OLD.is_active OR
    NEW.owner_id IS DISTINCT FROM OLD.owner_id OR
    NEW.referral_code IS DISTINCT FROM OLD.referral_code OR
    NEW.referred_by_store_id IS DISTINCT FROM OLD.referred_by_store_id OR
    NEW.country_code IS DISTINCT FROM OLD.country_code OR
    NEW.currency IS DISTINCT FROM OLD.currency
  ) AND NOT (
    COALESCE(auth.role() = 'service_role', false) OR
    COALESCE(is_platform_admin(), false)
  ) THEN
    RAISE EXCEPTION 'Not authorized to change plan, trial, active status, ownership, referral, country or currency fields directly'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS stores_guard_sensitive_columns ON public.stores;
CREATE TRIGGER stores_guard_sensitive_columns
  BEFORE UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.prevent_unauthorized_stores_update();
