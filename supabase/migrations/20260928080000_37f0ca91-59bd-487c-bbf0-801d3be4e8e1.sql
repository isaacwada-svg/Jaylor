-- Hardening pass on the server-side plan-limit triggers shipped in
-- 20260927100000 (enforce_order_limit / enforce_user_limit), after review
-- found four real bugs. Nothing here changes the intent of that migration
-- (still: feature_usage()'s counter for orders, check_feature_limit()'s
-- live count for users) -- it fixes how the checks are done.
--
-- 1. feature_usage() and check_feature_limit() both start with
--    `IF auth.uid() IS NULL OR NOT public.is_store_member(p_store_id) THEN
--    RAISE EXCEPTION 'Not authorized' ...` (see their tracked definitions in
--    20260921070226 and 20260921170000). A BEFORE trigger calling either of
--    them directly means:
--      - any service-role insert (auth.uid() is null outside a user's own
--        request) is hard-rejected with "Not authorized" instead of being
--        checked against the limit -- a working insert would start
--        throwing 42501.
--      - a user's own store_members row transitioning from 'invited' to
--        'active' fails too: is_store_member() reads status='active', which
--        is exactly the value the same UPDATE is still in the middle of
--        setting, so it isn't true yet when the trigger's check runs.
--    Both triggers below are rewritten to read usage_counters / plans /
--    store_members directly, with no auth.uid()/is_store_member call at
--    all -- the trigger firing on NEW.store_id is the only authorization
--    that belongs here; RLS on orders/store_members already governs who
--    can cause that row to be written.
--
-- 2. Race condition: two concurrent inserts both reading "19 of 20" would
--    both pass. Each trigger now takes pg_advisory_xact_lock() on a hash of
--    NEW.store_id (a different hash seed per table, so an order insert and
--    a staff activation for the same store don't needlessly block each
--    other) before reading usage. It's transaction-scoped: released
--    automatically at commit or rollback, so whichever concurrent
--    transaction gets the lock second sees the first one's already-updated
--    count once it proceeds.
--
-- 3. Trigger fire order: BEFORE ROW triggers on the same table fire in
--    name order, not creation order. Renamed to "00_enforce_order_limit"
--    (a leading digit sorts before any lowercase/underscore name, so this
--    fires first regardless of what the order-number trigger is actually
--    called -- its own name wasn't in tracked migration history to confirm
--    directly; see the report for the verification query to run).
--
-- 4. enforce_user_limit_trigger is now BEFORE INSERT OR UPDATE OF status,
--    and only enforces when status is becoming 'active' (not already
--    active before this statement) -- so accepting a staff invite (an
--    UPDATE, not an INSERT) is actually covered.

CREATE OR REPLACE FUNCTION public.enforce_order_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_code text;
  v_trial_ends timestamptz;
  v_limit_json jsonb;
  v_limit_num numeric;
  v_used numeric;
  v_month text := to_char(now() AT TIME ZONE 'Africa/Lagos', 'YYYY-MM');
BEGIN
  -- Serialize concurrent order inserts for this store so the read below
  -- can't race with another transaction's not-yet-committed insert.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.store_id::text, 0));

  SELECT trial_ends_at, plan_code INTO v_trial_ends, v_plan_code
  FROM public.stores WHERE id = NEW.store_id;

  IF NOT FOUND THEN
    RETURN NEW; -- invalid store_id -- let the FK constraint report it
  END IF;

  IF v_trial_ends IS NOT NULL AND v_trial_ends > now() THEN
    v_plan_code := 'growth';
  END IF;

  SELECT limits -> 'orders' INTO v_limit_json FROM public.plans WHERE code = v_plan_code;

  IF v_limit_json IS NULL OR jsonb_typeof(v_limit_json) <> 'number' THEN
    RETURN NEW; -- unlimited (or a non-numeric limit shape) -- nothing to enforce
  END IF;

  v_limit_num := (v_limit_json #>> '{}')::numeric;
  IF v_limit_num < 0 THEN
    RETURN NEW; -- negative = unlimited, same convention as feature_usage()
  END IF;

  SELECT orders INTO v_used FROM public.usage_counters
  WHERE store_id = NEW.store_id AND month = v_month;
  v_used := COALESCE(v_used, 0);

  IF v_used >= v_limit_num THEN
    RAISE EXCEPTION 'Monthly order limit reached for this plan. Upgrade to add more orders this month.'
      USING ERRCODE = 'P0100';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.enforce_order_limit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_order_limit_trigger ON public.orders;
DROP TRIGGER IF EXISTS "00_enforce_order_limit_trigger" ON public.orders;
CREATE TRIGGER "00_enforce_order_limit_trigger"
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_order_limit();

CREATE OR REPLACE FUNCTION public.enforce_user_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_becoming_active boolean;
  v_plan_code text;
  v_trial_ends timestamptz;
  v_limit_json jsonb;
  v_limit_num numeric;
  v_used numeric;
BEGIN
  v_becoming_active :=
    NEW.status = 'active'
    AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active');

  IF NOT v_becoming_active THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.store_id::text, 1));

  SELECT trial_ends_at, plan_code INTO v_trial_ends, v_plan_code
  FROM public.stores WHERE id = NEW.store_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF v_trial_ends IS NOT NULL AND v_trial_ends > now() THEN
    v_plan_code := 'growth';
  END IF;

  SELECT limits -> 'users' INTO v_limit_json FROM public.plans WHERE code = v_plan_code;

  IF v_limit_json IS NULL OR jsonb_typeof(v_limit_json) <> 'number' THEN
    RETURN NEW;
  END IF;

  v_limit_num := (v_limit_json #>> '{}')::numeric;
  IF v_limit_num < 0 THEN
    RETURN NEW;
  END IF;

  -- A BEFORE trigger's SELECT only ever sees the pre-statement snapshot, in
  -- which this row is never yet counted as active (a fresh INSERT isn't
  -- visible yet; an UPDATE's OLD row is exactly what v_becoming_active just
  -- confirmed wasn't 'active') -- no need to exclude NEW.id here.
  SELECT count(*) INTO v_used
  FROM public.store_members
  WHERE store_id = NEW.store_id AND status = 'active';

  IF v_used >= v_limit_num THEN
    RAISE EXCEPTION 'Staff limit reached for this plan. Upgrade to add more team members.'
      USING ERRCODE = 'P0101';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.enforce_user_limit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_user_limit_trigger ON public.store_members;
CREATE TRIGGER enforce_user_limit_trigger
BEFORE INSERT OR UPDATE OF status ON public.store_members
FOR EACH ROW EXECUTE FUNCTION public.enforce_user_limit();
