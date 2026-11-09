-- Relax the directory's "recent order" requirement for now.
--
-- get_directory_listings/get_directory_locations/get_directory_specialties
-- all required _store_has_recent_order() (an order in the last 60 days) on
-- top of directory_listed/is_active/onboarding_completed. With zero stores
-- opted into the directory yet (confirmed live: opted_in = 0), that extra
-- gate creates a bootstrap catch-22 -- a shop that just turned the toggle
-- on can't appear until it's already done business, so the very first
-- listings can never get started. Dropping the recent-order gate from all
-- three (and from get_directory_eligibility's "why don't I appear" check,
-- so the Settings explanation stays truthful) while keeping every other
-- requirement as-is. _store_has_recent_order() itself is left in place,
-- unused for now, in case this should come back once the directory has
-- real listings to protect from going stale.
--
-- Safe to run more than once: every function is CREATE OR REPLACE.

BEGIN;

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

CREATE OR REPLACE FUNCTION public.get_directory_locations()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('state', s.state, 'city', s.city)), '[]'::jsonb)
  FROM public.stores s
  JOIN public.store_settings ss ON ss.store_id = s.id
  WHERE ss.directory_listed
    AND s.is_active
    AND s.onboarding_completed
    AND NOT coalesce(s.directory_hidden_by_admin, false)
    AND ss.directory_show_area
    AND s.city IS NOT NULL;
$$;
REVOKE EXECUTE ON FUNCTION public.get_directory_locations() FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.get_directory_locations() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_directory_specialties()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(DISTINCT t.specialty ORDER BY t.specialty), '[]'::jsonb)
  FROM (
    SELECT unnest(ss.directory_specialties) AS specialty
    FROM public.stores s
    JOIN public.store_settings ss ON ss.store_id = s.id
    WHERE ss.directory_listed
      AND s.is_active
      AND s.onboarding_completed
      AND NOT coalesce(s.directory_hidden_by_admin, false)
  ) t;
$$;
REVOKE EXECUTE ON FUNCTION public.get_directory_specialties() FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.get_directory_specialties() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_directory_eligibility(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store record;
  v_listed boolean;
  v_has_recent_order boolean;
BEGIN
  IF NOT public.is_store_member(p_store_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT is_active, onboarding_completed, coalesce(directory_hidden_by_admin, false) AS hidden_by_admin
  INTO v_store FROM public.stores WHERE id = p_store_id;

  SELECT coalesce(directory_listed, false) INTO v_listed
  FROM public.store_settings WHERE store_id = p_store_id;

  v_has_recent_order := public._store_has_recent_order(p_store_id);

  RETURN jsonb_build_object(
    'directory_listed', coalesce(v_listed, false),
    'is_active', coalesce(v_store.is_active, false),
    'onboarding_completed', coalesce(v_store.onboarding_completed, false),
    'hidden_by_admin', coalesce(v_store.hidden_by_admin, false),
    'has_recent_order', v_has_recent_order,
    'appears', coalesce(v_listed, false)
      AND coalesce(v_store.is_active, false)
      AND coalesce(v_store.onboarding_completed, false)
      AND NOT coalesce(v_store.hidden_by_admin, false)
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_directory_eligibility(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_directory_eligibility(uuid) TO authenticated;

COMMIT;

-- ============================================================
-- Verification: expect every row true, failed_checks empty.
-- ============================================================
SELECT
  bool_and(ok) AS all_true,
  coalesce(array_agg(check_name) FILTER (WHERE NOT ok), ARRAY[]::text[]) AS failed_checks
FROM (
  SELECT 'get_directory_listings no longer requires a recent order' AS check_name,
    NOT (pg_get_functiondef('public.get_directory_listings(text,text,text,text,integer)'::regprocedure) ILIKE '%_store_has_recent_order%') AS ok
  UNION ALL
  SELECT 'get_directory_locations no longer requires a recent order',
    NOT (pg_get_functiondef('public.get_directory_locations()'::regprocedure) ILIKE '%_store_has_recent_order%')
  UNION ALL
  SELECT 'get_directory_specialties no longer requires a recent order',
    NOT (pg_get_functiondef('public.get_directory_specialties()'::regprocedure) ILIKE '%_store_has_recent_order%')
  UNION ALL
  SELECT 'get_directory_eligibility appears no longer requires a recent order',
    (
      SELECT count(*) = 3
      FROM regexp_matches(
        pg_get_functiondef('public.get_directory_eligibility(uuid)'::regprocedure),
        'v_has_recent_order', 'g'
      )
    )
) checks;
