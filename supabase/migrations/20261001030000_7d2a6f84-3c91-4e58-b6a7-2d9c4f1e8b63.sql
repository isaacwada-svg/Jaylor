-- Fix the onboarding "Not authorized" bug: every brand-new signup has hit
-- this creating their very first store, with no exceptions.
--
-- handle_new_store() (AFTER INSERT on stores) immediately inserts the new
-- owner's row into store_members. That insert fires enforce_user_limit()
-- (BEFORE INSERT on store_members), which calls check_feature_limit(), which
-- itself requires the caller to already be a member of the store
-- (IF NOT is_store_member(p_store_id) THEN RAISE EXCEPTION 'Not authorized').
-- At the exact moment the owner's first membership row is being inserted,
-- they are by definition not yet a member of anything -- that row is the
-- membership being created -- so the check always fails and the whole
-- transaction (including the original INSERT INTO stores the client made)
-- rolls back.
--
-- check_feature_limit()'s own membership gate is correct for its other
-- call sites (an existing staff member checking limits before adding a
-- client/order/etc.) and isn't touched here. The actual fix is narrower:
-- a store's own owner row is created once as part of creating the store
-- itself, not a staff seat being added against the plan's user limit, so
-- the limit check shouldn't run for it at all.

CREATE OR REPLACE FUNCTION public.enforce_user_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_usage jsonb;
BEGIN
  IF NEW.status = 'active' AND NEW.role <> 'owner' THEN
    v_usage := public.check_feature_limit(NEW.store_id, 'users', 1);
    IF NOT COALESCE((v_usage ->> 'allowed')::boolean, true) THEN
      RAISE EXCEPTION 'Staff limit reached for this plan. Upgrade to add more team members.' USING ERRCODE = 'P0101';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
