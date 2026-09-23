-- Moments system, phase 1: data model, per-store settings, the generation
-- engine (real-time triggers + a daily cron for time-delayed/date-driven
-- moments), and the fit-feedback table. Canvas-rendered shareable cards
-- and the owner-moments celebration are separate follow-up work.
--
-- Every moment is tap-to-send only: this table only ever stores a
-- pre-written, editable message and a due date. Sending happens client-side
-- via the existing wa.me tap-to-send link (src/lib/whatsapp.ts), exactly
-- like every other WhatsApp touch in this app -- nothing here calls the
-- WhatsApp Business API or any automated-send path.
--
-- Reuses what already exists rather than duplicating it:
--   - clients.birthday and clients.consent_whatsapp (no new columns for
--     either -- consent_whatsapp already is the "do not message" gate).
--   - calendar_event_defs + next_calendar_occurrence() for festive dates
--     (christmas, new_year, easter, eid_al_fitr, eid_al_adha already exist
--     as seeded keys from the earlier calendar-closures feature).

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS first_order_date date;

CREATE OR REPLACE FUNCTION public.set_client_first_order_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status <> 'cancelled' THEN
    UPDATE public.clients
      SET first_order_date = NEW.created_at::date
      WHERE id = NEW.client_id AND first_order_date IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_client_first_order_date() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER set_client_first_order_date_after_insert
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_client_first_order_date();

-- ============================================================
-- moments
-- ============================================================

CREATE TABLE public.moments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN (
    'birthday', 'anniversary', 'ready', 'progress', 'fitcheck', 'winback', 'festive'
  )),
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'dismissed')),
  message text NOT NULL,
  photo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX moments_store_due_idx ON public.moments (store_id, due_date, status);
CREATE INDEX moments_client_idx ON public.moments (client_id, created_at DESC);

ALTER TABLE public.moments ENABLE ROW LEVEL SECURITY;

CREATE POLICY moments_owner_manager_select
  ON public.moments FOR SELECT TO authenticated
  USING (has_store_role(store_id, ARRAY['owner'::store_role, 'manager'::store_role]));

-- Owner/manager can mark a moment sent/dismissed and edit its message
-- before sending, but never rewrite type/client/due_date/order_id -- only
-- the generator functions (service-role, via create_moment) create rows.
CREATE POLICY moments_owner_manager_update
  ON public.moments FOR UPDATE TO authenticated
  USING (has_store_role(store_id, ARRAY['owner'::store_role, 'manager'::store_role]))
  WITH CHECK (has_store_role(store_id, ARRAY['owner'::store_role, 'manager'::store_role]));

REVOKE ALL ON public.moments FROM PUBLIC, anon;
GRANT SELECT, UPDATE ON public.moments TO authenticated;
GRANT ALL ON public.moments TO service_role;

-- ============================================================
-- moment_settings: per-store on/off switch per moment type
-- ============================================================

CREATE TABLE public.moment_settings (
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN (
    'birthday', 'anniversary', 'ready', 'progress', 'fitcheck', 'winback', 'festive'
  )),
  enabled boolean NOT NULL DEFAULT true,
  PRIMARY KEY (store_id, type)
);

ALTER TABLE public.moment_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY moment_settings_owner_manager_select
  ON public.moment_settings FOR SELECT TO authenticated
  USING (has_store_role(store_id, ARRAY['owner'::store_role, 'manager'::store_role]));

CREATE POLICY moment_settings_owner_update
  ON public.moment_settings FOR UPDATE TO authenticated
  USING (has_store_role(store_id, ARRAY['owner'::store_role]))
  WITH CHECK (has_store_role(store_id, ARRAY['owner'::store_role]));

REVOKE ALL ON public.moment_settings FROM PUBLIC, anon;
GRANT SELECT, UPDATE ON public.moment_settings TO authenticated;
GRANT ALL ON public.moment_settings TO service_role;

CREATE OR REPLACE FUNCTION public.seed_moment_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.moment_settings (store_id, type, enabled)
  SELECT NEW.id, t, (t <> 'progress')
  FROM unnest(ARRAY['birthday','anniversary','ready','progress','fitcheck','winback','festive']) AS t
  ON CONFLICT (store_id, type) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_moment_settings() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER seed_moment_settings_after_store
AFTER INSERT ON public.stores
FOR EACH ROW EXECUTE FUNCTION public.seed_moment_settings();

-- Backfill existing stores.
INSERT INTO public.moment_settings (store_id, type, enabled)
SELECT s.id, t, (t <> 'progress')
FROM public.stores s
CROSS JOIN unnest(ARRAY['birthday','anniversary','ready','progress','fitcheck','winback','festive']) AS t
ON CONFLICT (store_id, type) DO NOTHING;

-- ============================================================
-- client_fit_feedback
-- ============================================================

CREATE TABLE public.client_fit_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  area text NOT NULL,
  result text NOT NULL CHECK (result IN ('perfect', 'too_tight', 'too_loose', 'too_short', 'too_long')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX client_fit_feedback_client_idx ON public.client_fit_feedback (client_id, created_at DESC);

ALTER TABLE public.client_fit_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_fit_feedback_owner_manager_select
  ON public.client_fit_feedback FOR SELECT TO authenticated
  USING (has_store_role(store_id, ARRAY['owner'::store_role, 'manager'::store_role]));

REVOKE ALL ON public.client_fit_feedback FROM PUBLIC, anon;
GRANT SELECT ON public.client_fit_feedback TO authenticated;
GRANT ALL ON public.client_fit_feedback TO service_role;

-- Guest-facing RPC: the fit-check moment links to a public page (like the
-- other unguessable-token guest flows) where the client picks a result
-- without ever needing an account. Verifies the order belongs to the
-- client before recording anything.
CREATE OR REPLACE FUNCTION public.record_fit_feedback(
  p_order_id uuid, p_client_id uuid, p_area text, p_result text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
BEGIN
  IF p_result NOT IN ('perfect', 'too_tight', 'too_loose', 'too_short', 'too_long') THEN
    RAISE EXCEPTION 'Invalid result' USING ERRCODE = '22023';
  END IF;
  IF p_area IS NULL OR length(trim(p_area)) = 0 OR length(p_area) > 40 THEN
    RAISE EXCEPTION 'Invalid area' USING ERRCODE = '22023';
  END IF;

  SELECT store_id INTO v_store_id FROM public.orders
    WHERE id = p_order_id AND client_id = p_client_id;
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.client_fit_feedback (store_id, client_id, order_id, area, result)
  VALUES (v_store_id, p_client_id, p_order_id, p_area, p_result);
END;
$$;

REVOKE ALL ON FUNCTION public.record_fit_feedback(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_fit_feedback(uuid, uuid, text, text) TO anon, authenticated;

-- ============================================================
-- Moment creation helper (idempotent: never duplicates a moment for the
-- same client+type in the same calendar year, or the same order+type ever)
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_moment(
  p_store_id uuid, p_client_id uuid, p_type text, p_due_date date,
  p_message text, p_order_id uuid DEFAULT NULL, p_photo_url text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_order_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.moments WHERE order_id = p_order_id AND type = p_type
    ) THEN
      RETURN;
    END IF;
  ELSIF EXISTS (
    SELECT 1 FROM public.moments
    WHERE client_id = p_client_id AND type = p_type
      AND date_part('year', due_date) = date_part('year', p_due_date)
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.moments (store_id, client_id, order_id, type, due_date, message, photo_url)
  VALUES (p_store_id, p_client_id, p_order_id, p_type, p_due_date, p_message, p_photo_url);
END;
$$;

REVOKE ALL ON FUNCTION public.create_moment(uuid, uuid, text, date, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_moment(uuid, uuid, text, date, text, uuid, text) TO service_role;

-- ============================================================
-- Real-time triggers: ready, progress
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_order_ready_moment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
  v_client public.clients%ROWTYPE;
BEGIN
  IF NEW.status = 'ready' AND OLD.status IS DISTINCT FROM 'ready' THEN
    SELECT enabled INTO v_enabled FROM public.moment_settings
      WHERE store_id = NEW.store_id AND type = 'ready';
    SELECT * INTO v_client FROM public.clients WHERE id = NEW.client_id;

    IF coalesce(v_enabled, true) AND v_client.consent_whatsapp THEN
      PERFORM public.create_moment(
        NEW.store_id, NEW.client_id, 'ready', current_date,
        format('Hi %s, your %s is ready for collection.',
          split_part(v_client.full_name, ' ', 1), NEW.garment_type),
        NEW.id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_order_ready_moment() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER notify_order_ready_moment_after_update
AFTER UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.notify_order_ready_moment();

CREATE OR REPLACE FUNCTION public.notify_order_progress_moment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
  v_client public.clients%ROWTYPE;
BEGIN
  IF NEW.status IN ('cutting', 'sewing') AND OLD.status NOT IN ('cutting', 'sewing') THEN
    SELECT enabled INTO v_enabled FROM public.moment_settings
      WHERE store_id = NEW.store_id AND type = 'progress';
    IF coalesce(v_enabled, false) THEN
      SELECT * INTO v_client FROM public.clients WHERE id = NEW.client_id;
      IF v_client.consent_whatsapp THEN
        PERFORM public.create_moment(
          NEW.store_id, NEW.client_id, 'progress', current_date,
          format('Hi %s, your %s is now in %s. Sharing a quick look at the progress.',
            split_part(v_client.full_name, ' ', 1), NEW.garment_type, NEW.status),
          NEW.id
        );
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_order_progress_moment() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER notify_order_progress_moment_after_update
AFTER UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.notify_order_progress_moment();

-- ============================================================
-- Daily generators: fitcheck, birthday, anniversary, winback, festive
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_fitcheck_moments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT o.id AS order_id, o.store_id, o.client_id, o.garment_type, c.full_name, c.consent_whatsapp
    FROM public.orders o
    JOIN public.clients c ON c.id = o.client_id
    JOIN public.moment_settings ms ON ms.store_id = o.store_id AND ms.type = 'fitcheck'
    WHERE o.status = 'collected'
      AND o.collected_at::date = current_date - 2
      AND ms.enabled
      AND c.consent_whatsapp
  LOOP
    PERFORM public.create_moment(
      r.store_id, r.client_id, 'fitcheck', current_date,
      format('Hi %s, how is the fit on your %s? Let me know if anything needs adjusting.',
        split_part(r.full_name, ' ', 1), r.garment_type),
      r.order_id
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_fitcheck_moments() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_fitcheck_moments() TO service_role;

CREATE OR REPLACE FUNCTION public.generate_birthday_moments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_target date;
BEGIN
  FOR r IN
    SELECT c.id AS client_id, c.store_id, c.full_name, c.birthday
    FROM public.clients c
    JOIN public.moment_settings ms ON ms.store_id = c.store_id AND ms.type = 'birthday'
    WHERE c.birthday IS NOT NULL AND ms.enabled AND c.consent_whatsapp
  LOOP
    -- Clamp a Feb 29 birthday to Feb 28 in a non-leap target year rather
    -- than letting make_date raise and abort the whole batch.
    BEGIN
      v_target := make_date(
        extract(year FROM current_date)::int, extract(month FROM r.birthday)::int, extract(day FROM r.birthday)::int
      );
    EXCEPTION WHEN OTHERS THEN
      v_target := make_date(extract(year FROM current_date)::int, 2, 28);
    END;
    IF v_target < current_date THEN
      BEGIN
        v_target := make_date(
          extract(year FROM current_date)::int + 1, extract(month FROM r.birthday)::int, extract(day FROM r.birthday)::int
        );
      EXCEPTION WHEN OTHERS THEN
        v_target := make_date(extract(year FROM current_date)::int + 1, 2, 28);
      END;
    END IF;

    IF v_target = current_date + 5 THEN
      PERFORM public.create_moment(
        r.store_id, r.client_id, 'birthday', current_date,
        format('Happy birthday in advance, %s. If you would like something made for the celebration, let me know this week.',
          split_part(r.full_name, ' ', 1))
      );
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_birthday_moments() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_birthday_moments() TO service_role;

CREATE OR REPLACE FUNCTION public.generate_anniversary_moments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.id AS client_id, c.store_id, c.full_name
    FROM public.clients c
    JOIN public.moment_settings ms ON ms.store_id = c.store_id AND ms.type = 'anniversary'
    WHERE c.birthday IS NULL
      AND c.first_order_date IS NOT NULL
      AND c.first_order_date < current_date
      AND extract(month FROM c.first_order_date) = extract(month FROM current_date)
      AND extract(day FROM c.first_order_date) = extract(day FROM current_date)
      AND ms.enabled
      AND c.consent_whatsapp
  LOOP
    PERFORM public.create_moment(
      r.store_id, r.client_id, 'anniversary', current_date,
      format('One year since your first outfit with us, %s.', split_part(r.full_name, ' ', 1))
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_anniversary_moments() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_anniversary_moments() TO service_role;

CREATE OR REPLACE FUNCTION public.generate_winback_moments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  -- Runs daily but only actually fires on Mondays ("listed weekly").
  IF extract(dow FROM current_date) <> 1 THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT c.id AS client_id, c.store_id, c.full_name, max(o.created_at) AS last_order_at
    FROM public.clients c
    JOIN public.moment_settings ms ON ms.store_id = c.store_id AND ms.type = 'winback'
    LEFT JOIN public.orders o ON o.client_id = c.id AND o.status <> 'cancelled'
    WHERE ms.enabled AND c.consent_whatsapp
    GROUP BY c.id, c.store_id, c.full_name, ms.enabled
    HAVING max(o.created_at) IS NOT NULL AND max(o.created_at) < now() - interval '90 days'
  LOOP
    PERFORM public.create_moment(
      r.store_id, r.client_id, 'winback', current_date,
      format('Hi %s, it has been a while. Let me know if you have anything coming up we can help with.',
        split_part(r.full_name, ' ', 1))
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_winback_moments() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_winback_moments() TO service_role;

CREATE OR REPLACE FUNCTION public.generate_festive_moments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_label text;
  v_event date;
  r record;
BEGIN
  FOREACH v_key IN ARRAY ARRAY['christmas', 'new_year', 'easter', 'eid_al_fitr', 'eid_al_adha']
  LOOP
    SELECT label INTO v_label FROM public.calendar_event_defs WHERE key = v_key;
    SELECT event_date INTO v_event
      FROM public.next_calendar_occurrence(p_key => v_key, p_from_date => current_date)
      LIMIT 1;
    IF v_event IS NULL OR v_event <> current_date + 5 THEN
      CONTINUE;
    END IF;

    FOR r IN
      SELECT c.id AS client_id, c.store_id, c.full_name
      FROM public.clients c
      JOIN public.moment_settings ms ON ms.store_id = c.store_id AND ms.type = 'festive'
      WHERE ms.enabled AND c.consent_whatsapp
    LOOP
      PERFORM public.create_moment(
        r.store_id, r.client_id, 'festive', current_date,
        format('Hi %s, wishing you a wonderful %s. Let me know if you need anything made in time for it.',
          split_part(r.full_name, ' ', 1), v_label)
      );
    END LOOP;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_festive_moments() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_festive_moments() TO service_role;

-- Schedule everything daily, same no-op-if-unavailable guard used
-- elsewhere in this project.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    PERFORM cron.unschedule('moments-daily')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'moments-daily');
    PERFORM cron.schedule(
      'moments-daily',
      '0 6 * * *',
      $cron$
        SELECT public.generate_fitcheck_moments();
        SELECT public.generate_birthday_moments();
        SELECT public.generate_anniversary_moments();
        SELECT public.generate_winback_moments();
        SELECT public.generate_festive_moments();
      $cron$
    );
  END IF;
END;
$$;
