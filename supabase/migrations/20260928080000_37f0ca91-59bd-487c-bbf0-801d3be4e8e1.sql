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
--
-- 5. Live-DB review found usage_counters can under-count orders: it's kept
--    in sync by an untracked AFTER INSERT trigger (orders_track_usage ->
--    track_order_usage() -> increment_usage_counter()), and one store's
--    counter was already behind its real order count by 2 because that
--    trigger was added live partway through a month, after that store's
--    first two orders that month had already been inserted. A deleted
--    order can't make the counter overcount either way (nothing
--    decrements it). So both enforce_order_limit() and feature_usage()'s
--    'orders' branch now use GREATEST(counter, real row count for the
--    Lagos month) -- the real count catches anything the counter missed,
--    while the counter itself is kept as the floor so deleting orders
--    can never free up quota.

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
  v_counter_used numeric;
  v_real_used numeric;
  v_used numeric;
  v_month text := to_char(now() AT TIME ZONE 'Africa/Lagos', 'YYYY-MM');
  v_month_start timestamptz := date_trunc('month', now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos';
  v_month_end timestamptz := v_month_start + interval '1 month';
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

  SELECT orders INTO v_counter_used FROM public.usage_counters
  WHERE store_id = NEW.store_id AND month = v_month;

  -- A BEFORE trigger's SELECT sees the pre-statement snapshot, so this
  -- doesn't double-count the row currently being inserted.
  SELECT count(*) INTO v_real_used FROM public.orders
  WHERE store_id = NEW.store_id AND created_at >= v_month_start AND created_at < v_month_end;

  v_used := GREATEST(COALESCE(v_counter_used, 0), v_real_used);

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

-- feature_usage()'s 'orders' branch gets the same GREATEST(counter, real
-- count) fix as enforce_order_limit() above, for the same reason (item 5)
-- -- this is what the billing page's paywall and usage display read, so it
-- needs to agree with what the trigger enforces. Reproduced from the
-- tracked definition in 20260921070226 with only that branch changed; the
-- auth.uid()/is_store_member() check stays exactly as it was.
CREATE OR REPLACE FUNCTION public.feature_usage(p_store_id uuid, p_feature text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_code text;
  v_trial_ends timestamptz;
  v_limit_json jsonb;
  v_used numeric := 0;
  v_month text := to_char(now() AT TIME ZONE 'Africa/Lagos', 'YYYY-MM');
  v_month_start timestamptz;
  v_month_end timestamptz;
  v_real_orders numeric;
  v_allowed boolean;
  v_required_plan text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_store_member(p_store_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_feature IS NULL OR length(p_feature) = 0 OR length(p_feature) > 64 THEN
    RAISE EXCEPTION 'Invalid feature' USING ERRCODE = '22023';
  END IF;

  SELECT trial_ends_at, plan_code INTO v_trial_ends, v_plan_code
  FROM public.stores
  WHERE id = p_store_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Store not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_trial_ends IS NOT NULL AND v_trial_ends > now() THEN
    v_plan_code := 'growth';
  END IF;

  SELECT limits -> p_feature INTO v_limit_json
  FROM public.plans
  WHERE code = v_plan_code;

  IF p_feature IN ('orders', 'messages', 'whatsapp_auto', 'ai_scan', 'ai_preview', 'voice_orders') THEN
    SELECT coalesce(
      CASE p_feature
        WHEN 'orders' THEN orders
        WHEN 'messages' THEN messages
        WHEN 'whatsapp_auto' THEN messages
        WHEN 'ai_scan' THEN ai_scans
        WHEN 'ai_preview' THEN ai_previews
        WHEN 'voice_orders' THEN voice_orders
      END, 0)
    INTO v_used
    FROM public.usage_counters
    WHERE store_id = p_store_id AND month = v_month;
  END IF;

  IF p_feature = 'orders' THEN
    v_month_start := date_trunc('month', now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos';
    v_month_end := v_month_start + interval '1 month';

    SELECT count(*) INTO v_real_orders
    FROM public.orders
    WHERE store_id = p_store_id AND created_at >= v_month_start AND created_at < v_month_end;

    v_used := GREATEST(v_used, v_real_orders);
  END IF;

  IF v_limit_json IS NULL THEN
    v_allowed := true;
  ELSIF jsonb_typeof(v_limit_json) = 'boolean' THEN
    v_allowed := (v_limit_json #>> '{}')::boolean;
  ELSIF jsonb_typeof(v_limit_json) = 'number' THEN
    v_allowed := (v_limit_json #>> '{}')::numeric < 0
      OR v_used < (v_limit_json #>> '{}')::numeric;
  ELSE
    v_allowed := true;
  END IF;

  SELECT p.code INTO v_required_plan
  FROM public.plans p
  WHERE (
    jsonb_typeof(p.limits -> p_feature) = 'boolean'
    AND (p.limits -> p_feature #>> '{}')::boolean
  ) OR (
    jsonb_typeof(p.limits -> p_feature) = 'number'
    AND ((p.limits -> p_feature #>> '{}')::numeric < 0
      OR v_used < (p.limits -> p_feature #>> '{}')::numeric)
  )
  ORDER BY p.sort_order ASC
  LIMIT 1;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'limit', v_limit_json,
    'used', v_used,
    'plan', v_plan_code,
    'required_plan', v_required_plan
  );
END;
$$;
REVOKE ALL ON FUNCTION public.feature_usage(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.feature_usage(uuid, text) TO authenticated, service_role;

-- One-time backfill for the current Lagos month: raise usage_counters.orders
-- to the real order count wherever the (untracked) increment trigger missed
-- some, without ever lowering a counter that's already correct or ahead
-- (e.g. from orders since deleted). Uses UPDATE-then-insert-if-missing
-- rather than INSERT ... ON CONFLICT, since this session has no way to
-- confirm usage_counters' live unique constraint is on exactly
-- (store_id, month).
DO $$
DECLARE
  v_month text := to_char(now() AT TIME ZONE 'Africa/Lagos', 'YYYY-MM');
  v_month_start timestamptz := date_trunc('month', now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos';
  v_month_end timestamptz := v_month_start + interval '1 month';
  r record;
  v_rows int;
BEGIN
  FOR r IN
    SELECT o.store_id AS store_id, count(*) AS real_count
    FROM public.orders o
    WHERE o.created_at >= v_month_start AND o.created_at < v_month_end
    GROUP BY o.store_id
  LOOP
    UPDATE public.usage_counters
    SET orders = GREATEST(coalesce(orders, 0), r.real_count)
    WHERE store_id = r.store_id AND month = v_month;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      INSERT INTO public.usage_counters (store_id, month, orders)
      VALUES (r.store_id, v_month, r.real_count);
    END IF;
  END LOOP;
END;
$$;
