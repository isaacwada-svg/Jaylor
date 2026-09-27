-- Server-side plan-limit enforcement for orders and staff seats.
--
-- The order limit was previously UI-only: order-form.tsx checks
-- feature_usage(store_id, 'orders') and hides the form, but the insert
-- itself had no server-side check, so a direct API call could exceed the
-- Free plan's monthly order allowance.
--
-- Note: 'orders' usage is tracked in usage_counters (a wide table with one
-- column per legacy feature), read via the feature_usage() RPC -- a
-- separate system from feature_usage_counters/check_feature_limit(), which
-- backs 'users', 'storefront_items' and the newer generic feature keys.
-- These two counter systems are not interchangeable: check_feature_limit()
-- never sees an 'orders' row, since nothing writes one into
-- feature_usage_counters for that key. Each trigger below calls whichever
-- RPC is actually kept in sync for that feature, so the server check always
-- agrees with what the UI already shows.
--
-- Custom SQLSTATE codes (P0100/P0101) are used instead of the plpgsql
-- default (P0001, already used by many unrelated RAISE EXCEPTIONs in this
-- schema) so client code can distinguish "blocked by a plan limit" from any
-- other rejection.

CREATE OR REPLACE FUNCTION public.enforce_order_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usage jsonb;
BEGIN
  v_usage := public.feature_usage(NEW.store_id, 'orders');
  IF NOT COALESCE((v_usage ->> 'allowed')::boolean, true) THEN
    RAISE EXCEPTION 'Monthly order limit reached for this plan. Upgrade to add more orders this month.'
      USING ERRCODE = 'P0100';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.enforce_order_limit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_order_limit_trigger ON public.orders;
CREATE TRIGGER enforce_order_limit_trigger
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_order_limit();

CREATE OR REPLACE FUNCTION public.enforce_user_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usage jsonb;
BEGIN
  IF NEW.status = 'active' THEN
    v_usage := public.check_feature_limit(NEW.store_id, 'users', 1);
    IF NOT COALESCE((v_usage ->> 'allowed')::boolean, true) THEN
      RAISE EXCEPTION 'Staff limit reached for this plan. Upgrade to add more team members.'
        USING ERRCODE = 'P0101';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.enforce_user_limit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_user_limit_trigger ON public.store_members;
CREATE TRIGGER enforce_user_limit_trigger
BEFORE INSERT ON public.store_members
FOR EACH ROW EXECUTE FUNCTION public.enforce_user_limit();
