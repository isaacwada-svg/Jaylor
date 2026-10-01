-- PR Q0: enforce plan gating for nine features that were either entirely
-- unenforced or only loosely/inconsistently gated, so the plan cards and
-- comparison table (PR Q) can finally describe what the product actually
-- does. Each key is set explicitly for every plan code (free, growth,
-- business, custom) -- nothing here relies on a key being absent from
-- limits defaulting to "allowed" (confirmed: feature_usage() and
-- check_feature_limit() both treat an absent key as allowed=true).
--
-- Growth and above (free: false, growth/business/custom: true -- a trialing
-- store reads plan_code = 'growth' in feature_usage()/_store_has_feature(),
-- so Pattern A (a plain read, no separate trial clause) already includes
-- the trial correctly):
--   quotations, group_events, consultations, digests, receipt_logo,
--   on_time_badge, capacity_planning
--
-- Business and above (free/growth: false, business/custom: true, PLUS a
-- trialing store -- same has_health_report_access/has_multi_currency_access
-- pattern, since during trial plan_code reads 'growth', which is false for
-- these two, so the trial needs its own explicit OR clause):
--   job_board, contracts
--
-- Per-feature notes (live definitions pulled first, per feature, before any
-- rewrite):
--
-- - consultations: already has a dead-code gate (_require_consultations_feature
--   / _store_has_feature, from the fittings migration) -- the 'consultations'
--   key was simply never written to plans.limits, so it has always defaulted
--   to allowed=true everywhere. No function changes needed, just the key.
--
-- - quotations: no existing gate at all (only the per-staff
--   can_manage_quotations role flag, unrelated to plan). New: a BEFORE
--   INSERT trigger on quotes, so an existing quote stays viewable/editable
--   on any plan -- only creating a new one is blocked.
--
-- - group_events / contracts: both are rows of the same public.events
--   table, split only by payer_mode ('single_payer' = contracts, anything
--   else = group/aso-ebi events). One BEFORE INSERT trigger branches on
--   payer_mode to apply the right key -- existing events/contracts stay
--   viewable regardless of plan; only new ones are blocked.
--
-- - digests: get_daily_digest_data/get_weekly_digest_data stay ungated at
--   the SQL level (an admin "send test digest" should still be able to
--   preview the shape) -- the actual skip happens in src/lib/digest.server.ts,
--   which is where the scheduled send path and the settings-UI toggle both
--   already live.
--
-- - receipt_logo: pure rendering, no SQL function touches this -- gated
--   client-side in receipt-dialog.tsx.
--
-- - on_time_badge: three places. get_store_on_time_score() (the dashboard
--   card's own RPC) stays ungated, since _compute_health_report() also
--   calls it for its own (Business+) work.on_time_rate figure and must not
--   lose that. get_storefront_on_time_badge() already had its own ad-hoc
--   inline "growth or above" boolean -- replaced here with a read of the
--   new explicit key (same effective behaviour, now auditable like every
--   other feature). get_directory_listings()'s badge_eligible flag had NO
--   plan check at all until now (an inconsistency with the storefront
--   badge) -- added.
--
-- - capacity_planning: get_store_capacity_forecast/get_order_capacity_check
--   (the dashboard chart and the order-form warning) now return their
--   existing "capacity unknown" shape when the store isn't gated, which
--   both callers already render as "nothing to show" -- no frontend change
--   needed for either. get_weekly_digest_data's overloaded_weeks is gated
--   the same way (empty array instead of computed).
--
-- Downgrading never deletes or hides existing data: every gate here is on
-- the CREATE path only (a trigger on INSERT, or a read-only RPC returning
-- an empty/neutral shape) -- nothing here touches SELECT/UPDATE on
-- existing rows, and no scheduled consultation is cancelled by this PR.
--
-- Safe to run more than once.

BEGIN;

-- ============================================================
-- 1. Plan keys -- explicit for every plan, both groups.
-- ============================================================
UPDATE public.plans SET limits = limits
  || jsonb_build_object('quotations', true)
  || jsonb_build_object('group_events', true)
  || jsonb_build_object('consultations', true)
  || jsonb_build_object('digests', true)
  || jsonb_build_object('receipt_logo', true)
  || jsonb_build_object('on_time_badge', true)
  || jsonb_build_object('capacity_planning', true)
WHERE code IN ('growth', 'business', 'custom');

UPDATE public.plans SET limits = limits
  || jsonb_build_object('quotations', false)
  || jsonb_build_object('group_events', false)
  || jsonb_build_object('consultations', false)
  || jsonb_build_object('digests', false)
  || jsonb_build_object('receipt_logo', false)
  || jsonb_build_object('on_time_badge', false)
  || jsonb_build_object('capacity_planning', false)
WHERE code = 'free';

UPDATE public.plans SET limits = limits
  || jsonb_build_object('job_board', true)
  || jsonb_build_object('contracts', true)
WHERE code IN ('business', 'custom');

UPDATE public.plans SET limits = limits
  || jsonb_build_object('job_board', false)
  || jsonb_build_object('contracts', false)
WHERE code IN ('free', 'growth');

-- ============================================================
-- 1.5. _store_has_feature() already exists (added for consultations) and is
--      reused below for on_time_badge/capacity_planning -- all SQL-to-SQL
--      calls from inside another SECURITY DEFINER function's body, which
--      bypass grants entirely. digest.server.ts's service-role call for
--      'digests' is different: it goes through PostgREST as the
--      service_role database role directly, same as _store_order_balances
--      in PR P, so it needs its own explicit grant.
-- ============================================================
GRANT EXECUTE ON FUNCTION public._store_has_feature(uuid, text) TO service_role;

-- ============================================================
-- 2. Pattern B: Business-and-above-plus-trial boolean access checks,
--    identical shape to has_health_report_access/has_multi_currency_access.
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_job_board_access(p_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(plan_code IN ('business', 'custom'), false)
    OR (trial_ends_at IS NOT NULL AND trial_ends_at > now())
  FROM public.stores WHERE id = p_store_id;
$$;
REVOKE EXECUTE ON FUNCTION public.has_job_board_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_job_board_access(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.has_contracts_access(p_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(plan_code IN ('business', 'custom'), false)
    OR (trial_ends_at IS NOT NULL AND trial_ends_at > now())
  FROM public.stores WHERE id = p_store_id;
$$;
REVOKE EXECUTE ON FUNCTION public.has_contracts_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_contracts_access(uuid) TO authenticated;

-- ============================================================
-- 3. Quotations: BEFORE INSERT trigger only -- existing quotes stay
--    viewable/editable on any plan.
-- ============================================================
CREATE OR REPLACE FUNCTION public._require_quotations_feature(p_store_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed boolean;
BEGIN
  SELECT (public.feature_usage(p_store_id, 'quotations') ->> 'allowed')::boolean INTO v_allowed;
  IF NOT coalesce(v_allowed, false) THEN
    RAISE EXCEPTION 'Quotations require the Growth plan' USING ERRCODE = 'P0136';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._require_quotations_feature(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._enforce_quotations_feature()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._require_quotations_feature(NEW.store_id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS quotes_enforce_feature ON public.quotes;
CREATE TRIGGER quotes_enforce_feature
  BEFORE INSERT ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public._enforce_quotations_feature();

-- ============================================================
-- 4. Group events / contracts: one BEFORE INSERT trigger on the shared
--    events table, branching on payer_mode. Existing rows (of either kind)
--    stay viewable on any plan -- only new ones are blocked.
-- ============================================================
CREATE OR REPLACE FUNCTION public._enforce_event_feature()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed boolean;
BEGIN
  IF NEW.payer_mode = 'single_payer' THEN
    IF NOT public.has_contracts_access(NEW.store_id) THEN
      RAISE EXCEPTION 'Contracts require the Business plan' USING ERRCODE = 'P0137';
    END IF;
  ELSE
    SELECT (public.feature_usage(NEW.store_id, 'group_events') ->> 'allowed')::boolean INTO v_allowed;
    IF NOT coalesce(v_allowed, false) THEN
      RAISE EXCEPTION 'Group events require the Growth plan' USING ERRCODE = 'P0138';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS events_enforce_feature ON public.events;
CREATE TRIGGER events_enforce_feature
  BEFORE INSERT ON public.events
  FOR EACH ROW EXECUTE FUNCTION public._enforce_event_feature();

-- ============================================================
-- 5. On-time badge: get_storefront_on_time_badge's own ad-hoc inline
--    "growth or above" boolean replaced with a read of the new explicit
--    key, via the same private _store_has_feature() the consultations
--    gate already uses (trial-aware, auth-free -- this function is called
--    from a public storefront page with no session). Body otherwise
--    unchanged.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_storefront_on_time_badge(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store record;
  v_settings record;
  v_stats record;
BEGIN
  SELECT plan_code, trial_ends_at, is_active INTO v_store
  FROM public.stores WHERE id = p_store_id;
  IF NOT FOUND OR NOT v_store.is_active THEN
    RETURN NULL;
  END IF;

  IF NOT public._store_has_feature(p_store_id, 'on_time_badge') THEN
    RETURN NULL;
  END IF;

  SELECT on_time_badge_enabled INTO v_settings
  FROM public.store_settings WHERE store_id = p_store_id;
  IF NOT FOUND OR NOT v_settings.on_time_badge_enabled THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_stats FROM public._store_on_time_stats(p_store_id);
  IF NOT v_stats.has_enough_data THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object('rate', v_stats.rate, 'orders_counted', v_stats.orders_counted);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_storefront_on_time_badge(uuid) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.get_storefront_on_time_badge(uuid) TO anon, authenticated;

-- ============================================================
-- 6. Directory badge: get_directory_listings' own badge_eligible flag had
--    no plan check at all until now (an inconsistency with the storefront
--    badge, which did) -- added, via the same _store_has_feature() used
--    above. is_paid_or_trial (a separate, broader ranking signal, not an
--    on_time_badge-specific gate) is untouched.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_directory_listings(
  p_search text DEFAULT NULL,
  p_state text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_specialty text DEFAULT NULL,
  p_page integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_per_page integer := 20;
  v_offset integer := (v_page - 1) * v_per_page;
  v_total integer := 0;
  v_results jsonb := '[]'::jsonb;
BEGIN
  WITH eligible AS (
    SELECT
      s.id AS store_id,
      s.name,
      s.slug,
      s.logo_url,
      s.whatsapp_phone,
      CASE WHEN ss.directory_show_area THEN s.area ELSE NULL END AS area,
      CASE WHEN ss.directory_show_area THEN s.city ELSE NULL END AS city,
      ss.directory_bio AS bio,
      coalesce(ss.directory_specialties, '{}') AS specialties,
      coalesce(ss.directory_remote_orders, false) AS remote_orders,
      public._directory_is_paid_or_trial(s.plan_code, s.trial_ends_at) AS is_paid_or_trial,
      ots.rate AS on_time_rate,
      ots.orders_counted AS on_time_orders_counted,
      (coalesce(ss.on_time_badge_enabled, false) AND ots.has_enough_data
        AND public._store_has_feature(s.id, 'on_time_badge')) AS badge_eligible,
      (SELECT max(o.created_at) FROM public.orders o WHERE o.store_id = s.id) AS last_order_at
    FROM public.stores s
    JOIN public.store_settings ss ON ss.store_id = s.id
    CROSS JOIN LATERAL public._store_on_time_stats(s.id) ots
    WHERE ss.directory_listed
      AND s.is_active
      AND s.onboarding_completed
      AND NOT coalesce(s.directory_hidden_by_admin, false)
      AND public._store_has_recent_order(s.id)
      AND (p_search IS NULL OR p_search = '' OR s.name ILIKE '%' || p_search || '%')
      AND (p_state IS NULL OR s.state = p_state)
      AND (p_city IS NULL OR s.city = p_city)
      AND (p_specialty IS NULL OR p_specialty = ANY(coalesce(ss.directory_specialties, '{}')))
  ),
  paged AS (
    SELECT
      e.*,
      count(*) OVER() AS total_count,
      row_number() OVER (
        ORDER BY e.is_paid_or_trial DESC,
                 (CASE WHEN e.badge_eligible THEN e.on_time_rate ELSE NULL END) DESC NULLS LAST,
                 e.last_order_at DESC NULLS LAST
      ) AS rn
    FROM eligible e
    ORDER BY rn
    LIMIT v_per_page OFFSET v_offset
  )
  SELECT
    coalesce(max(p.total_count), 0),
    coalesce(jsonb_agg(jsonb_build_object(
      'store_id', p.store_id,
      'name', p.name,
      'slug', p.slug,
      'logo_url', p.logo_url,
      'whatsapp_phone', p.whatsapp_phone,
      'area', p.area,
      'city', p.city,
      'bio', p.bio,
      'specialties', to_jsonb(p.specialties),
      'remote_orders', p.remote_orders,
      'badge', CASE WHEN p.badge_eligible
        THEN jsonb_build_object('rate', p.on_time_rate, 'orders_counted', p.on_time_orders_counted)
        ELSE NULL END
    ) ORDER BY p.rn), '[]'::jsonb)
  INTO v_total, v_results
  FROM paged p;

  RETURN jsonb_build_object(
    'results', v_results,
    'page', v_page,
    'per_page', v_per_page,
    'total_count', v_total,
    'total_pages', greatest(ceil(v_total::numeric / v_per_page)::integer, 1)
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_directory_listings(text, text, text, text, integer) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.get_directory_listings(text, text, text, text, integer) TO anon, authenticated;

-- ============================================================
-- 7. Capacity planning: the two read-only RPCs return their existing
--    "capacity unknown" shape when ungated -- both callers (CapacityWarning,
--    CapacityLoadChart) already render that as "nothing to show", so no
--    frontend change is needed for either.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_store_capacity_forecast(p_store_id uuid, p_weeks int DEFAULT 6)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_capacity numeric;
  v_source text;
  v_weeks_of_data int;
  v_weeks jsonb;
BEGIN
  IF NOT public.is_store_member(p_store_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_weeks < 1 OR p_weeks > 26 THEN
    RAISE EXCEPTION 'p_weeks out of range' USING ERRCODE = 'P0105';
  END IF;

  IF NOT public._store_has_feature(p_store_id, 'capacity_planning') THEN
    RETURN jsonb_build_object(
      'capacity', NULL, 'capacity_source', 'none', 'weeks_of_data', 0, 'weeks', '[]'::jsonb
    );
  END IF;

  SELECT capacity, source, weeks_of_data INTO v_capacity, v_source, v_weeks_of_data
  FROM public._store_weekly_throughput(p_store_id);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'week_start', w.week_start,
    'garments_due', coalesce(d.qty, 0),
    'capacity', v_capacity,
    'overloaded', v_capacity IS NOT NULL AND coalesce(d.qty, 0) > v_capacity
  ) ORDER BY w.week_start), '[]'::jsonb) INTO v_weeks
  FROM (
    SELECT (date_trunc('week', now())::date + (n * 7)) AS week_start
    FROM generate_series(0, p_weeks - 1) AS n
  ) w
  LEFT JOIN (
    SELECT date_trunc('week', coalesce(o.promised_date, o.delivery_date)::timestamp)::date AS week_start,
           sum(o.quantity) AS qty
    FROM public.orders o
    WHERE o.store_id = p_store_id
      AND o.status NOT IN ('collected', 'cancelled')
      AND coalesce(o.promised_date, o.delivery_date) IS NOT NULL
    GROUP BY 1
  ) d ON d.week_start = w.week_start;

  RETURN jsonb_build_object(
    'capacity', v_capacity,
    'capacity_source', v_source,
    'weeks_of_data', v_weeks_of_data,
    'weeks', v_weeks
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_store_capacity_forecast(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_store_capacity_forecast(uuid, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_order_capacity_check(p_store_id uuid, p_date date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_capacity numeric;
  v_source text;
  v_weeks_of_data int;
  v_week_start date := date_trunc('week', p_date::timestamp)::date;
  v_garments_due int;
  v_overloaded boolean;
  v_suggested_week date;
BEGIN
  IF NOT public.is_store_member(p_store_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF NOT public._store_has_feature(p_store_id, 'capacity_planning') THEN
    RETURN jsonb_build_object(
      'week_start', v_week_start, 'garments_due', 0, 'capacity', NULL,
      'capacity_source', 'none', 'overloaded', false, 'suggested_week', NULL
    );
  END IF;

  SELECT capacity, source, weeks_of_data INTO v_capacity, v_source, v_weeks_of_data
  FROM public._store_weekly_throughput(p_store_id);

  SELECT coalesce(sum(o.quantity), 0) INTO v_garments_due
  FROM public.orders o
  WHERE o.store_id = p_store_id
    AND o.status NOT IN ('collected', 'cancelled')
    AND date_trunc('week', coalesce(o.promised_date, o.delivery_date)::timestamp)::date = v_week_start;

  v_overloaded := v_capacity IS NOT NULL AND v_garments_due > v_capacity;

  IF v_overloaded THEN
    SELECT w.week_start INTO v_suggested_week
    FROM (
      SELECT (v_week_start + (n * 7)) AS week_start
      FROM generate_series(1, 12) AS n
    ) w
    LEFT JOIN (
      SELECT date_trunc('week', coalesce(o.promised_date, o.delivery_date)::timestamp)::date AS week_start,
             sum(o.quantity) AS qty
      FROM public.orders o
      WHERE o.store_id = p_store_id AND o.status NOT IN ('collected', 'cancelled')
      GROUP BY 1
    ) d ON d.week_start = w.week_start
    WHERE coalesce(d.qty, 0) <= v_capacity
    ORDER BY w.week_start
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'week_start', v_week_start,
    'garments_due', v_garments_due,
    'capacity', v_capacity,
    'capacity_source', v_source,
    'overloaded', coalesce(v_overloaded, false),
    'suggested_week', v_suggested_week
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_order_capacity_check(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_order_capacity_check(uuid, date) TO authenticated;

-- ============================================================
-- 8. Weekly digest's overloaded_weeks: empty when ungated, every other
--    field unchanged (including other_currencies/currency work from PR P).
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_weekly_digest_data(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_orders int;
  v_billed numeric;
  v_collected numeric;
  v_outstanding numeric;
  v_overdue_count int;
  v_garments_due numeric;
  v_capacity numeric;
  v_overloaded_weeks jsonb;
  v_other_currencies jsonb;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.has_store_role(p_store_id, ARRAY['owner'::store_role, 'manager'::store_role]) THEN
    RAISE EXCEPTION 'You do not have permission to do this' USING ERRCODE = 'P0103';
  END IF;

  SELECT count(*), coalesce(sum(price), 0) INTO v_new_orders, v_billed
  FROM public.orders WHERE store_id = p_store_id AND currency = 'NGN'
    AND created_at >= now() - interval '7 days';

  SELECT coalesce(sum(amount), 0) INTO v_collected
  FROM public.payments
  WHERE store_id = p_store_id AND voided = false AND currency = 'NGN'
    AND paid_at >= now() - interval '7 days';

  SELECT coalesce(sum(b.balance), 0) INTO v_outstanding
  FROM public._store_order_balances(p_store_id) b WHERE b.currency = 'NGN';

  SELECT count(*) INTO v_overdue_count
  FROM public.orders
  WHERE store_id = p_store_id AND status NOT IN ('collected', 'cancelled')
    AND delivery_date::date < current_date;

  SELECT coalesce(sum(quantity), 0) INTO v_garments_due
  FROM public.orders
  WHERE store_id = p_store_id AND status NOT IN ('collected', 'cancelled')
    AND delivery_date::date BETWEEN current_date AND current_date + 6;

  IF public._store_has_feature(p_store_id, 'capacity_planning') THEN
    SELECT capacity INTO v_capacity FROM public._store_weekly_throughput(p_store_id);

    SELECT coalesce(jsonb_agg(w.week_start ORDER BY w.week_start), '[]'::jsonb) INTO v_overloaded_weeks
    FROM (
      SELECT (date_trunc('week', now())::date + (n * 7)) AS week_start
      FROM generate_series(0, 5) AS n
    ) w
    LEFT JOIN (
      SELECT date_trunc('week', coalesce(o.promised_date, o.delivery_date)::timestamp)::date AS week_start,
             sum(o.quantity) AS qty
      FROM public.orders o
      WHERE o.store_id = p_store_id AND o.status NOT IN ('collected', 'cancelled')
      GROUP BY 1
    ) d ON d.week_start = w.week_start
    WHERE v_capacity IS NOT NULL AND coalesce(d.qty, 0) > v_capacity;
  ELSE
    v_overloaded_weeks := '[]'::jsonb;
  END IF;

  SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO v_other_currencies
  FROM (
    SELECT
      o.currency,
      coalesce(sum(o.price) FILTER (WHERE o.created_at >= now() - interval '7 days'), 0) AS billed,
      coalesce((
        SELECT sum(p.amount) FROM public.payments p
        WHERE p.store_id = p_store_id AND p.currency = o.currency AND p.voided = false
          AND p.paid_at >= now() - interval '7 days'
      ), 0) AS collected,
      coalesce((
        SELECT sum(b.balance) FROM public._store_order_balances(p_store_id) b
        WHERE b.currency = o.currency
      ), 0) AS outstanding
    FROM public.orders o
    WHERE o.store_id = p_store_id AND o.currency <> 'NGN'
    GROUP BY o.currency
  ) x;

  RETURN jsonb_build_object(
    'new_orders', v_new_orders,
    'billed', v_billed,
    'collected', v_collected,
    'outstanding_total', v_outstanding,
    'overdue_count', v_overdue_count,
    'garments_due_this_week', v_garments_due,
    'overloaded_weeks', v_overloaded_weeks,
    'other_currencies', v_other_currencies
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_weekly_digest_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_weekly_digest_data(uuid) TO authenticated, service_role;

COMMIT;

-- ============================================================
-- Verification: expect every row true, failed_checks empty.
-- ============================================================
SELECT
  bool_and(ok) AS all_true,
  coalesce(array_agg(check_name) FILTER (WHERE NOT ok), ARRAY[]::text[]) AS failed_checks
FROM (
  SELECT 'growth-plus keys true for growth' AS check_name,
    (SELECT (limits->>'quotations')::boolean AND (limits->>'group_events')::boolean
      AND (limits->>'consultations')::boolean AND (limits->>'digests')::boolean
      AND (limits->>'receipt_logo')::boolean AND (limits->>'on_time_badge')::boolean
      AND (limits->>'capacity_planning')::boolean
     FROM public.plans WHERE code = 'growth') AS ok
  UNION ALL
  SELECT 'growth-plus keys false for free',
    (SELECT NOT (limits->>'quotations')::boolean AND NOT (limits->>'group_events')::boolean
      AND NOT (limits->>'consultations')::boolean AND NOT (limits->>'digests')::boolean
      AND NOT (limits->>'receipt_logo')::boolean AND NOT (limits->>'on_time_badge')::boolean
      AND NOT (limits->>'capacity_planning')::boolean
     FROM public.plans WHERE code = 'free')
  UNION ALL
  SELECT 'business-plus keys true for business',
    (SELECT (limits->>'job_board')::boolean AND (limits->>'contracts')::boolean
     FROM public.plans WHERE code = 'business')
  UNION ALL
  SELECT 'business-plus keys false for growth',
    (SELECT NOT (limits->>'job_board')::boolean AND NOT (limits->>'contracts')::boolean
     FROM public.plans WHERE code = 'growth')
  UNION ALL
  SELECT 'has_job_board_access exists', to_regprocedure('public.has_job_board_access(uuid)') IS NOT NULL
  UNION ALL
  SELECT 'has_contracts_access exists', to_regprocedure('public.has_contracts_access(uuid)') IS NOT NULL
  UNION ALL
  SELECT 'quotes_enforce_feature trigger exists',
    EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'quotes_enforce_feature')
  UNION ALL
  SELECT 'events_enforce_feature trigger exists',
    EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'events_enforce_feature')
  UNION ALL
  SELECT 'get_storefront_on_time_badge uses _store_has_feature',
    (pg_get_functiondef('public.get_storefront_on_time_badge(uuid)'::regprocedure) ILIKE '%_store_has_feature%')
  UNION ALL
  SELECT 'get_directory_listings checks on_time_badge feature',
    (pg_get_functiondef('public.get_directory_listings(text,text,text,text,integer)'::regprocedure) ILIKE '%on_time_badge%')
  UNION ALL
  SELECT 'get_store_capacity_forecast checks capacity_planning',
    (pg_get_functiondef('public.get_store_capacity_forecast(uuid,int)'::regprocedure) ILIKE '%capacity_planning%')
  UNION ALL
  SELECT 'get_order_capacity_check checks capacity_planning',
    (pg_get_functiondef('public.get_order_capacity_check(uuid,date)'::regprocedure) ILIKE '%capacity_planning%')
  UNION ALL
  SELECT 'get_weekly_digest_data checks capacity_planning',
    (pg_get_functiondef('public.get_weekly_digest_data(uuid)'::regprocedure) ILIKE '%capacity_planning%')
  UNION ALL
  SELECT 'service_role can call _store_has_feature', has_function_privilege(
    'service_role', 'public._store_has_feature(uuid,text)', 'execute'
  )
) checks;
