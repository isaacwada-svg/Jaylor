-- 1. Fashion calendar: recurring event definitions (computation rules, not dates).
CREATE TABLE IF NOT EXISTS public.calendar_event_defs (
  key text PRIMARY KEY,
  label text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('fixed_date', 'nth_weekday_of_month', 'gregorian_easter_relative', 'islamic_date', 'manual')),
  fixed_month integer,
  fixed_day integer,
  nth_weekday_month integer,
  nth_weekday_dow integer,
  nth_weekday_n integer,
  easter_offset_days integer,
  hijri_month integer,
  hijri_day integer,
  lead_weeks_message text,
  default_enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);
ALTER TABLE public.calendar_event_defs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS calendar_event_defs_public_read ON public.calendar_event_defs;
CREATE POLICY calendar_event_defs_public_read
  ON public.calendar_event_defs FOR SELECT
  TO anon, authenticated
  USING (true);

INSERT INTO public.calendar_event_defs (key, label, kind, fixed_month, fixed_day, nth_weekday_month, nth_weekday_dow, nth_weekday_n, easter_offset_days, hijri_month, hijri_day, lead_weeks_message, sort_order) VALUES
  ('new_year', 'New Year', 'fixed_date', 1, 1, NULL, NULL, NULL, NULL, NULL, NULL, 'A quiet season for most shops — good time to catch up on backlog.', 1),
  ('valentines', 'Valentine''s Day', 'fixed_date', 2, 14, NULL, NULL, NULL, NULL, NULL, NULL, 'Couple/matching outfit requests often pick up. Stock complementary fabrics.', 2),
  ('mothers_day', 'Mother''s Day', 'nth_weekday_of_month', NULL, NULL, 5, 0, 2, NULL, NULL, NULL, 'Gifted outfits and mother-daughter sets are common — consider a small promo.', 3),
  ('easter', 'Easter', 'gregorian_easter_relative', NULL, NULL, NULL, NULL, NULL, 0, NULL, NULL, 'Church and family outfits pick up in the weeks before.', 4),
  ('independence_day', 'Independence Day', 'fixed_date', 10, 1, NULL, NULL, NULL, NULL, NULL, NULL, 'Green-and-white and corporate/uniform orders often rise.', 5),
  ('ramadan_start', 'Ramadan', 'islamic_date', NULL, NULL, NULL, NULL, NULL, NULL, 9, 1, 'Fewer new orders during the fast, but ready-to-wear and family-set demand often builds toward Eid.', 6),
  ('eid_al_fitr', 'Eid al-Fitr (Sallah)', 'islamic_date', NULL, NULL, NULL, NULL, NULL, NULL, 10, 1, 'Most shops get busy 3 weeks before. Order fabric and plan staff now.', 7),
  ('eid_al_adha', 'Eid al-Adha (Sallah)', 'islamic_date', NULL, NULL, NULL, NULL, NULL, NULL, 12, 10, 'Most shops get busy 3 weeks before. Order fabric and plan staff now.', 8),
  ('wedding_season', 'Peak wedding season', 'manual', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Aso-ebi and related orders typically peak in this window — set your own dates below if this differs for your area.', 9),
  ('school_term_1', 'School resumption (Term 1)', 'manual', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Uniform orders spike ahead of resumption — set your own date below.', 10),
  ('school_term_2', 'School resumption (Term 2)', 'manual', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Uniform orders spike ahead of resumption — set your own date below.', 11),
  ('school_term_3', 'School resumption (Term 3)', 'manual', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Uniform orders spike ahead of resumption — set your own date below.', 12),
  ('christmas', 'Christmas', 'fixed_date', 12, 25, NULL, NULL, NULL, NULL, NULL, NULL, 'Most shops get busy 3 weeks before. Order fabric and plan staff now.', 13)
ON CONFLICT (key) DO NOTHING;

-- 2. Overrides: platform-wide (store_id NULL) for correcting a computed
--    Islamic date against an official announcement, or per-store for
--    school-term/wedding-season dates that have no formula at all.
CREATE TABLE IF NOT EXISTS public.calendar_event_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL REFERENCES public.calendar_event_defs(key),
  year integer NOT NULL,
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  event_date date NOT NULL,
  event_end_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.calendar_event_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS calendar_event_overrides_read ON public.calendar_event_overrides;
CREATE POLICY calendar_event_overrides_read
  ON public.calendar_event_overrides FOR SELECT
  TO authenticated
  USING (store_id IS NULL OR is_store_member(store_id));

CREATE UNIQUE INDEX IF NOT EXISTS calendar_event_overrides_global_uniq
  ON public.calendar_event_overrides (key, year) WHERE store_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS calendar_event_overrides_store_uniq
  ON public.calendar_event_overrides (key, year, store_id) WHERE store_id IS NOT NULL;

-- 3. Per-store opt-out of individual events ("a shop that never does
--    Christmas work is not nagged about it").
CREATE TABLE IF NOT EXISTS public.store_calendar_events (
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  event_key text NOT NULL REFERENCES public.calendar_event_defs(key),
  enabled boolean NOT NULL DEFAULT true,
  PRIMARY KEY (store_id, event_key)
);
ALTER TABLE public.store_calendar_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS store_calendar_events_member_read ON public.store_calendar_events;
CREATE POLICY store_calendar_events_member_read
  ON public.store_calendar_events FOR SELECT
  TO authenticated
  USING (is_store_member(store_id));

-- 4. Gregorian Easter (Anonymous Gregorian / Meeus-Jones-Butcher algorithm).
CREATE OR REPLACE FUNCTION public.easter_date(p_year integer)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  a int := p_year % 19;
  b int := p_year / 100;
  c int := p_year % 100;
  d int := b / 4;
  e int := b % 4;
  f int := (b + 8) / 25;
  g int := (b - f + 1) / 3;
  h int := (19*a + b - d - g + 15) % 30;
  i int := c / 4;
  k int := c % 4;
  l int := (32 + 2*e + 2*i - h - k) % 7;
  m int := (a + 11*h + 22*l) / 451;
  v_month int := (h + l - 7*m + 114) / 31;
  v_day int := ((h + l - 7*m + 114) % 31) + 1;
BEGIN
  RETURN make_date(p_year, v_month, v_day);
END;
$$;

-- 5. Nth weekday of a month (e.g. 2nd Sunday of May, for Mother's Day).
--    p_dow: 0=Sunday..6=Saturday, matching Postgres EXTRACT(DOW).
CREATE OR REPLACE FUNCTION public.nth_weekday_date(p_year integer, p_month integer, p_dow integer, p_n integer)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (make_date(p_year, p_month, 1)
    + ((p_dow - EXTRACT(DOW FROM make_date(p_year, p_month, 1))::int + 7) % 7)
    + (p_n - 1) * 7
  )::date;
$$;

-- 6. Tabular Islamic (Hijri) calendar → Gregorian date. A well-known
--    arithmetic approximation (Reingold & Dershowitz, "Calendrical
--    Calculations"), accurate to within a day or two of true moon-sighting
--    announcements — hence the admin-override mechanism above.
CREATE OR REPLACE FUNCTION public.islamic_to_gregorian(p_year integer, p_month integer, p_day integer)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ('0001-01-01'::date + (
    227014
    + (p_year - 1) * 354
    + floor((3 + 11 * p_year) / 30.0)::int
    + 29 * (p_month - 1)
    + floor(p_month / 2.0)::int
    + p_day
    - 1
  ))::date;
$$;

-- 7. Next occurrence of a given Hijri month/day on or after a date, by
--    checking a small window of Hijri years bracketing the estimate —
--    sidesteps the "which Gregorian year does this fall in" problem
--    entirely, which is all a rolling lookahead card actually needs.
CREATE OR REPLACE FUNCTION public.next_islamic_event(p_hijri_month integer, p_hijri_day integer, p_from_date date DEFAULT CURRENT_DATE)
RETURNS date
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_hijri_year_estimate int := floor((EXTRACT(year FROM p_from_date) - 622) * 33.0 / 32.0)::int;
  v_candidate date;
  v_best date := NULL;
  v_y int;
BEGIN
  FOR v_y IN (v_hijri_year_estimate - 1)..(v_hijri_year_estimate + 2) LOOP
    v_candidate := islamic_to_gregorian(v_y, p_hijri_month, p_hijri_day);
    IF v_candidate >= p_from_date AND (v_best IS NULL OR v_candidate < v_best) THEN
      v_best := v_candidate;
    END IF;
  END LOOP;
  RETURN v_best;
END;
$$;

-- 8. Resolve one event's next occurrence: override (store-specific, then
--    platform-wide) takes precedence over the computed value.
CREATE OR REPLACE FUNCTION public.next_calendar_occurrence(p_key text, p_store_id uuid DEFAULT NULL, p_from_date date DEFAULT CURRENT_DATE)
RETURNS TABLE(event_date date, event_end_date date)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_def record;
  v_year int;
  v_candidate date;
  v_candidate_end date;
  v_override record;
BEGIN
  SELECT * INTO v_def FROM public.calendar_event_defs d WHERE d.key = p_key;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_def.kind = 'islamic_date' THEN
    v_candidate := next_islamic_event(v_def.hijri_month, v_def.hijri_day, p_from_date);
    IF v_candidate IS NULL THEN RETURN; END IF;
    SELECT * INTO v_override FROM public.calendar_event_overrides o
      WHERE o.key = p_key AND o.year = EXTRACT(year FROM v_candidate)::int
        AND (o.store_id = p_store_id OR o.store_id IS NULL)
      ORDER BY o.store_id NULLS LAST LIMIT 1;
    IF FOUND THEN
      event_date := v_override.event_date;
      event_end_date := v_override.event_end_date;
    ELSE
      event_date := v_candidate;
      event_end_date := NULL;
    END IF;
    RETURN NEXT;
    RETURN;
  END IF;

  FOR v_year IN EXTRACT(year FROM p_from_date)::int..(EXTRACT(year FROM p_from_date)::int + 1) LOOP
    SELECT * INTO v_override FROM public.calendar_event_overrides o
      WHERE o.key = p_key AND o.year = v_year
        AND (o.store_id = p_store_id OR o.store_id IS NULL)
      ORDER BY o.store_id NULLS LAST LIMIT 1;
    IF FOUND THEN
      v_candidate := v_override.event_date;
      v_candidate_end := v_override.event_end_date;
    ELSIF v_def.kind = 'fixed_date' THEN
      v_candidate := make_date(v_year, v_def.fixed_month, v_def.fixed_day);
      v_candidate_end := NULL;
    ELSIF v_def.kind = 'nth_weekday_of_month' THEN
      v_candidate := nth_weekday_date(v_year, v_def.nth_weekday_month, v_def.nth_weekday_dow, v_def.nth_weekday_n);
      v_candidate_end := NULL;
    ELSIF v_def.kind = 'gregorian_easter_relative' THEN
      v_candidate := easter_date(v_year) + COALESCE(v_def.easter_offset_days, 0);
      v_candidate_end := NULL;
    ELSE
      CONTINUE;
    END IF;

    IF v_candidate >= p_from_date THEN
      event_date := v_candidate;
      event_end_date := v_candidate_end;
      RETURN NEXT;
      RETURN;
    END IF;
  END LOOP;
END;
$$;

-- 9. The dashboard's "Coming up" card: every enabled event landing within
--    p_weeks_ahead, with this store's own history from the same run-up
--    last year when it exists.
CREATE OR REPLACE FUNCTION public.upcoming_calendar_events(p_store_id uuid, p_weeks_ahead integer DEFAULT 8)
RETURNS TABLE (
  event_key text,
  label text,
  event_date date,
  event_end_date date,
  days_away integer,
  lead_weeks_message text,
  last_year_order_count bigint,
  last_year_top_garment_types text
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_def record;
  v_occ record;
  v_enabled boolean;
  v_last_year_date date;
  v_count bigint;
  v_top text;
BEGIN
  IF NOT is_store_member(p_store_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  FOR v_def IN SELECT * FROM public.calendar_event_defs ORDER BY sort_order LOOP
    SELECT sce.enabled INTO v_enabled FROM public.store_calendar_events sce
      WHERE sce.store_id = p_store_id AND sce.event_key = v_def.key;
    IF v_enabled IS NULL THEN v_enabled := v_def.default_enabled; END IF;
    IF NOT v_enabled THEN CONTINUE; END IF;

    SELECT * INTO v_occ FROM public.next_calendar_occurrence(v_def.key, p_store_id, CURRENT_DATE);
    IF v_occ.event_date IS NULL THEN CONTINUE; END IF;
    IF v_occ.event_date > CURRENT_DATE + (p_weeks_ahead * 7) THEN CONTINUE; END IF;

    v_last_year_date := v_occ.event_date - interval '1 year';
    SELECT COUNT(*) INTO v_count
    FROM public.orders o
    WHERE o.store_id = p_store_id
      AND o.created_at >= (v_last_year_date - interval '4 weeks')
      AND o.created_at < (v_last_year_date + interval '1 day');

    v_top := NULL;
    IF v_count > 0 THEN
      SELECT string_agg(t.garment_type, ', ') INTO v_top FROM (
        SELECT o.garment_type, COUNT(*) AS c
        FROM public.orders o
        WHERE o.store_id = p_store_id
          AND o.created_at >= (v_last_year_date - interval '4 weeks')
          AND o.created_at < (v_last_year_date + interval '1 day')
        GROUP BY o.garment_type
        ORDER BY c DESC
        LIMIT 2
      ) t;
    END IF;

    event_key := v_def.key;
    label := v_def.label;
    event_date := v_occ.event_date;
    event_end_date := v_occ.event_end_date;
    days_away := (v_occ.event_date - CURRENT_DATE);
    lead_weeks_message := v_def.lead_weeks_message;
    last_year_order_count := v_count;
    last_year_top_garment_types := v_top;
    RETURN NEXT;
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION public.upcoming_calendar_events(uuid, integer) TO authenticated;

-- 10. Store toggles which events it cares about.
CREATE OR REPLACE FUNCTION public.set_store_calendar_event_enabled(p_store_id uuid, p_key text, p_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_store_member(p_store_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  INSERT INTO public.store_calendar_events (store_id, event_key, enabled)
  VALUES (p_store_id, p_key, p_enabled)
  ON CONFLICT (store_id, event_key) DO UPDATE SET enabled = EXCLUDED.enabled;
END;
$$;
REVOKE ALL ON FUNCTION public.set_store_calendar_event_enabled(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_store_calendar_event_enabled(uuid, text, boolean) TO authenticated;

-- 11. Store sets its own school-term/wedding-season dates (or any event,
--     for a store that knows better than the national default).
CREATE OR REPLACE FUNCTION public.set_store_calendar_override(p_store_id uuid, p_key text, p_year integer, p_event_date date, p_event_end_date date DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_store_member(p_store_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  INSERT INTO public.calendar_event_overrides (key, year, store_id, event_date, event_end_date)
  VALUES (p_key, p_year, p_store_id, p_event_date, p_event_end_date)
  ON CONFLICT (key, year, store_id) WHERE store_id IS NOT NULL DO UPDATE
    SET event_date = EXCLUDED.event_date, event_end_date = EXCLUDED.event_end_date;
END;
$$;
REVOKE ALL ON FUNCTION public.set_store_calendar_override(uuid, text, integer, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_store_calendar_override(uuid, text, integer, date, date) TO authenticated;

-- 12. Platform admin corrects a computed Islamic date against an official
--     Eid/Ramadan announcement.
CREATE OR REPLACE FUNCTION public.admin_set_calendar_override(p_key text, p_year integer, p_event_date date, p_event_end_date date DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  INSERT INTO public.calendar_event_overrides (key, year, store_id, event_date, event_end_date)
  VALUES (p_key, p_year, NULL, p_event_date, p_event_end_date)
  ON CONFLICT (key, year) WHERE store_id IS NULL DO UPDATE
    SET event_date = EXCLUDED.event_date, event_end_date = EXCLUDED.event_end_date;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_calendar_override(text, integer, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_calendar_override(text, integer, date, date) TO authenticated;
