-- PR K: "Find a Jaylor tailor" directory.
--
-- Before writing this, confirmed the fields this PR's eligibility rule needs
-- already exist: stores.is_active, stores.onboarding_completed, stores.plan_code,
-- stores.trial_ends_at, stores.garment_types (the "chosen from the store's
-- garment_types" source for specialties), orders.created_at (for the 60-day
-- activity check). Reused rather than duplicated: effectiveTier()'s exact
-- "paid or trial" rule (mirrored here as _directory_is_paid_or_trial, matching
-- get_storefront_on_time_badge's v_growth_or_above) and _store_on_time_stats()
-- (the existing private helper backing PR C's badge, including its
-- orders_counted >= 10 threshold) -- not reimplemented. Safe to run more than once.

BEGIN;

-- 1. Shop-controlled directory settings.
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS directory_listed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS directory_bio text,
  ADD COLUMN IF NOT EXISTS directory_specialties text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS directory_show_area boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS directory_remote_orders boolean NOT NULL DEFAULT false;

ALTER TABLE public.store_settings DROP CONSTRAINT IF EXISTS store_settings_directory_bio_length;
ALTER TABLE public.store_settings ADD CONSTRAINT store_settings_directory_bio_length
  CHECK (directory_bio IS NULL OR char_length(directory_bio) <= 200);

ALTER TABLE public.store_settings DROP CONSTRAINT IF EXISTS store_settings_directory_specialties_max8;
ALTER TABLE public.store_settings ADD CONSTRAINT store_settings_directory_specialties_max8
  CHECK (array_length(directory_specialties, 1) IS NULL OR array_length(directory_specialties, 1) <= 8);

-- 2. Admin-only moderation flag. Existing stores RLS lets an owner/manager
--    update their own store row broadly, and RLS can't restrict a single
--    column -- so a trigger reverts any change to this column that didn't
--    come from a platform admin, rather than trusting the app layer alone.
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS directory_hidden_by_admin boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public._protect_directory_hidden_by_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.directory_hidden_by_admin IS DISTINCT FROM OLD.directory_hidden_by_admin
     AND NOT public.is_platform_admin() THEN
    NEW.directory_hidden_by_admin := OLD.directory_hidden_by_admin;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._protect_directory_hidden_by_admin() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS protect_directory_hidden_by_admin ON public.stores;
CREATE TRIGGER protect_directory_hidden_by_admin
BEFORE UPDATE ON public.stores
FOR EACH ROW EXECUTE FUNCTION public._protect_directory_hidden_by_admin();

-- 3. Reports. No policies -- inserts go through create_directory_report(),
--    reads/updates through the admin_* functions below.
CREATE TABLE IF NOT EXISTS public.directory_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  reason text NOT NULL,
  details text,
  reporter_contact text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.directory_reports ENABLE ROW LEVEL SECURITY;

-- 4. Private helpers (no grants -- reachable only from the functions below).

CREATE OR REPLACE FUNCTION public._store_has_recent_order(p_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders
    WHERE store_id = p_store_id AND created_at >= now() - interval '60 days'
  );
$$;
REVOKE EXECUTE ON FUNCTION public._store_has_recent_order(uuid) FROM PUBLIC, anon, authenticated;

-- Mirrors get_storefront_on_time_badge's own "paid or trial" check exactly
-- (and the client's effectiveTier()), so ranking and the badge never disagree
-- about what counts as paid.
CREATE OR REPLACE FUNCTION public._directory_is_paid_or_trial(p_plan_code text, p_trial_ends_at timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT (p_trial_ends_at IS NOT NULL AND p_trial_ends_at > now()) OR coalesce(p_plan_code, 'free') <> 'free';
$$;
REVOKE EXECUTE ON FUNCTION public._directory_is_paid_or_trial(text, timestamptz) FROM PUBLIC, anon, authenticated;

-- 5. Public: paginated, filtered, ranked directory listings. Only ever
--    returns the safe public fields -- never owner data, street address, or
--    any field this PR doesn't name. area/city are nulled out server-side
--    (not just hidden client-side) when the shop turned directory_show_area
--    off, so a curious network inspection can't recover it either.
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
      (coalesce(ss.on_time_badge_enabled, false) AND ots.has_enough_data) AS badge_eligible,
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

-- 6. Public: distinct {state, city} among eligible, show_area listings --
--    backs the state/city filters and the /tailors/$citySlug pages/sitemap.
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
    AND s.city IS NOT NULL
    AND public._store_has_recent_order(s.id);
$$;
REVOKE EXECUTE ON FUNCTION public.get_directory_locations() FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.get_directory_locations() TO anon, authenticated;

-- 7. Public: distinct specialties among eligible listings, for the specialty filter.
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
      AND public._store_has_recent_order(s.id)
  ) t;
$$;
REVOKE EXECUTE ON FUNCTION public.get_directory_specialties() FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.get_directory_specialties() TO anon, authenticated;

-- 8. Staff-facing: why this shop might not appear yet (Settings preview note).
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
      AND v_has_recent_order
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_directory_eligibility(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_directory_eligibility(uuid) TO authenticated;

-- 9. Public: "Report this listing".
CREATE OR REPLACE FUNCTION public.create_directory_report(
  p_store_id uuid, p_reason text, p_details text DEFAULT NULL, p_reporter_contact text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store_id) THEN
    RAISE EXCEPTION 'Store not found' USING ERRCODE = 'P0102';
  END IF;
  IF coalesce(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'A reason is required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.directory_reports (store_id, reason, details, reporter_contact)
  VALUES (
    p_store_id,
    trim(p_reason),
    nullif(trim(coalesce(p_details, '')), ''),
    nullif(trim(coalesce(p_reporter_contact, '')), '')
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_directory_report(uuid, text, text, text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.create_directory_report(uuid, text, text, text) TO anon, authenticated;

-- 10. Platform admin: review reports and moderate listings.
CREATE OR REPLACE FUNCTION public.admin_list_directory_reports()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', r.id,
      'store_id', r.store_id,
      'store_name', s.name,
      'store_slug', s.slug,
      'reason', r.reason,
      'details', r.details,
      'reporter_contact', r.reporter_contact,
      'status', r.status,
      'created_at', r.created_at,
      'directory_hidden_by_admin', coalesce(s.directory_hidden_by_admin, false)
    ) ORDER BY r.created_at DESC)
    FROM public.directory_reports r
    JOIN public.stores s ON s.id = r.store_id
  ), '[]'::jsonb);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_list_directory_reports() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_directory_reports() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_directory_report_status(p_report_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('open', 'reviewed') THEN
    RAISE EXCEPTION 'Invalid status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.directory_reports SET status = p_status WHERE id = p_report_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_directory_report_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_directory_report_status(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_directory_hidden(p_store_id uuid, p_hidden boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.stores SET directory_hidden_by_admin = p_hidden WHERE id = p_store_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_directory_hidden(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_directory_hidden(uuid, boolean) TO authenticated;

-- 11. Verification -- one row: all_true, and which checks (if any) failed.
SELECT
  bool_and(v) AS all_true,
  coalesce(string_agg(k, ', ') FILTER (WHERE NOT v), 'none') AS failed_checks
FROM (VALUES
  ('store_settings_directory_listed', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'store_settings' AND column_name = 'directory_listed'
  )),
  ('stores_directory_hidden_by_admin', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stores' AND column_name = 'directory_hidden_by_admin'
  )),
  ('directory_reports_table', to_regclass('public.directory_reports') IS NOT NULL),
  ('directory_reports_rls', coalesce((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.directory_reports'::regclass), false)),
  ('protect_directory_hidden_trigger', EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'protect_directory_hidden_by_admin' AND NOT tgisinternal
  )),
  ('get_directory_listings_fn', to_regprocedure('public.get_directory_listings(text,text,text,text,integer)') IS NOT NULL),
  ('get_directory_locations_fn', to_regprocedure('public.get_directory_locations()') IS NOT NULL),
  ('get_directory_specialties_fn', to_regprocedure('public.get_directory_specialties()') IS NOT NULL),
  ('get_directory_eligibility_fn', to_regprocedure('public.get_directory_eligibility(uuid)') IS NOT NULL),
  ('create_directory_report_fn', to_regprocedure('public.create_directory_report(uuid,text,text,text)') IS NOT NULL),
  ('admin_list_directory_reports_fn', to_regprocedure('public.admin_list_directory_reports()') IS NOT NULL),
  ('admin_set_directory_report_status_fn', to_regprocedure('public.admin_set_directory_report_status(uuid,text)') IS NOT NULL),
  ('admin_set_directory_hidden_fn', to_regprocedure('public.admin_set_directory_hidden(uuid,boolean)') IS NOT NULL)
) AS checks(k, v);

COMMIT;
