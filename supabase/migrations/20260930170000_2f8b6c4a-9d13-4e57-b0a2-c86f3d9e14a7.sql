-- PR J: Client Passport claim and sharing control.
--
-- Before writing this, inspected the existing measurement-card system:
-- measurement_passports/measurement_passport_shares (one card per client per
-- ISSUING store, sharing is a request-and-accept flow reviewed by the target
-- shop via PassportShareInbox/accept_passport_share) and the customer portal's
-- passwordless WhatsApp code flow (portal_login_codes + portal_sessions,
-- issueLoginCode()/hashCode() in portal-login.server.ts, sendWhatsAppText()).
-- The old card system is issuing-store-scoped and request-based -- a genuinely
-- different shape than the cross-shop, self-service, phone-owned identity this
-- PR asks for -- so it is left untouched, not repurposed. What IS reused
-- directly: portal_login_codes (the same table, same issueLoginCode/hashCode
-- functions, same WhatsApp send) issues and checks the one-time code here too,
-- since a WhatsApp-verified phone is the same proof of identity either way.
-- Safe to run more than once.

BEGIN;

-- 1. The client's cross-shop identity, keyed by their verified phone.
CREATE TABLE IF NOT EXISTS public.passport_holders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164 text NOT NULL UNIQUE,
  verified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.passport_holders ENABLE ROW LEVEL SECURITY;
-- No policies -- every read/write is mediated by a SECURITY DEFINER function
-- keyed by a session or share token, same posture as PR H's fitting_links.

-- Short-lived (30 min) session, minted after a successful code verification.
CREATE TABLE IF NOT EXISTS public.passport_sessions (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holder_id uuid NOT NULL REFERENCES public.passport_holders(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.passport_sessions ENABLE ROW LEVEL SECURITY;

-- A reusable, unguessable link + QR the holder shows to a new tailor.
CREATE TABLE IF NOT EXISTS public.passport_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holder_id uuid NOT NULL REFERENCES public.passport_holders(id) ON DELETE CASCADE,
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  used_by_store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  last_accessed_at timestamptz
);
ALTER TABLE public.passport_shares ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.passport_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holder_id uuid NOT NULL REFERENCES public.passport_holders(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('viewed', 'imported', 'revoked')),
  at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.passport_access_log ENABLE ROW LEVEL SECURITY;

-- 2. Referral attribution, additive alongside the existing referral_code /
--    referred_by_store_id mechanism on stores.
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS referred_by_passport_share_id uuid REFERENCES public.passport_shares(id) ON DELETE SET NULL;

-- 3. Private helpers (no grants at all -- reachable only from the functions below).

CREATE OR REPLACE FUNCTION public._passport_phone_variants(p_phone_e164 text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  -- p_phone_e164 is always '+234XXXXXXXXXX' (normalizePhoneNG's output). Client
  -- phone numbers elsewhere in the app aren't guaranteed to be stored in that
  -- exact form, so match every common variant.
  SELECT ARRAY[
    p_phone_e164,
    substr(p_phone_e164, 2),
    '0' || substr(p_phone_e164, 5),
    substr(p_phone_e164, 5)
  ];
$$;
REVOKE EXECUTE ON FUNCTION public._passport_phone_variants(text) FROM PUBLIC, anon, authenticated;

-- Validates a passport session, touches last_seen_at, and returns the
-- holder's verified E.164 phone. Raises for a missing/expired session so
-- every caller gets the same "please verify again" handling.
CREATE OR REPLACE FUNCTION public._passport_session_phone(p_session_token uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text;
BEGIN
  SELECT h.phone_e164 INTO v_phone
  FROM public.passport_sessions s
  JOIN public.passport_holders h ON h.id = s.holder_id
  WHERE s.token = p_session_token AND s.expires_at > now();

  IF v_phone IS NULL THEN
    RAISE EXCEPTION 'Your session has expired. Please verify your phone again.' USING ERRCODE = 'P0130';
  END IF;

  UPDATE public.passport_sessions SET last_seen_at = now() WHERE token = p_session_token;
  RETURN v_phone;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._passport_session_phone(uuid) FROM PUBLIC, anon, authenticated;

-- 4. Called only from the server (supabaseAdmin), right after verifyPassportCode
--    checks the one-time code against portal_login_codes. Upserts the holder
--    and mints a fresh session. No grants -- the service role's own default
--    privileges are enough, same as every other server-only helper (e.g.
--    check_rate_limit).
CREATE OR REPLACE FUNCTION public.passport_start_session(p_phone_e164 text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_holder_id uuid;
  v_token uuid;
BEGIN
  INSERT INTO public.passport_holders (phone_e164, verified_at)
  VALUES (p_phone_e164, now())
  ON CONFLICT (phone_e164) DO UPDATE SET verified_at = now()
  RETURNING id INTO v_holder_id;

  INSERT INTO public.passport_sessions (holder_id)
  VALUES (v_holder_id)
  RETURNING token INTO v_token;

  RETURN v_token;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.passport_start_session(text) FROM PUBLIC, anon, authenticated;

-- 5. Holder-facing (session token): the consolidated view across every shop.
--    Own records (phone/whatsapp_phone match) and guardian records (a child's
--    record where guardian_phone matches) -- never anything reached only via
--    another adult's guardian_phone. A deleted store's clients are excluded
--    by the inner join. Templates are returned alongside so the client can
--    resolve field labels itself (reusing the existing pure templateFields()
--    helper) without needing its own RLS-restricted read of measurement_templates.
CREATE OR REPLACE FUNCTION public.get_passport_view(p_session_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text;
  v_variants text[];
  v_records jsonb;
  v_templates jsonb;
BEGIN
  v_phone := public._passport_session_phone(p_session_token);
  v_variants := public._passport_phone_variants(v_phone);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'client_id', c.id,
    'store_id', c.store_id,
    'store_name', s.name,
    'full_name', c.full_name,
    'relation', CASE
      WHEN c.phone = ANY(v_variants) OR c.whatsapp_phone = ANY(v_variants) THEN 'self'
      ELSE 'guardian'
    END,
    'versions', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id, 'version', m.version, 'taken_at', m.taken_at, 'unit', m.unit,
        'values', m.values, 'extra_fields', m.extra_fields, 'template_id', m.template_id,
        'notes', m.notes
      ) ORDER BY m.version DESC), '[]'::jsonb)
      FROM public.measurement_sets m WHERE m.client_id = c.id
    )
  ) ORDER BY s.name), '[]'::jsonb)
  INTO v_records
  FROM public.clients c
  JOIN public.stores s ON s.id = c.store_id
  WHERE c.phone = ANY(v_variants) OR c.whatsapp_phone = ANY(v_variants) OR c.guardian_phone = ANY(v_variants);

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'fields', t.fields)), '[]'::jsonb)
  INTO v_templates
  FROM public.measurement_templates t
  WHERE t.id IN (
    SELECT DISTINCT m.template_id
    FROM public.measurement_sets m
    JOIN public.clients c ON c.id = m.client_id
    WHERE (c.phone = ANY(v_variants) OR c.whatsapp_phone = ANY(v_variants) OR c.guardian_phone = ANY(v_variants))
      AND m.template_id IS NOT NULL
  );

  RETURN jsonb_build_object('records', v_records, 'templates', v_templates);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_passport_view(uuid) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.get_passport_view(uuid) TO anon, authenticated;

-- 6. Holder-facing: create a share link.
CREATE OR REPLACE FUNCTION public.create_passport_share(p_session_token uuid)
RETURNS public.passport_shares
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text;
  v_holder_id uuid;
  v_row public.passport_shares%ROWTYPE;
BEGIN
  v_phone := public._passport_session_phone(p_session_token);
  SELECT id INTO v_holder_id FROM public.passport_holders WHERE phone_e164 = v_phone;

  INSERT INTO public.passport_shares (holder_id) VALUES (v_holder_id)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_passport_share(uuid) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.create_passport_share(uuid) TO anon, authenticated;

-- 7. Holder-facing: list shares they've created, for the "shops with access" /
--    revoke screen.
CREATE OR REPLACE FUNCTION public.list_passport_shares(p_session_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text;
  v_holder_id uuid;
  v_shares jsonb;
BEGIN
  v_phone := public._passport_session_phone(p_session_token);
  SELECT id INTO v_holder_id FROM public.passport_holders WHERE phone_e164 = v_phone;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', sh.id,
    'token', sh.token,
    'created_at', sh.created_at,
    'revoked_at', sh.revoked_at,
    'last_accessed_at', sh.last_accessed_at,
    'used_by_store_name', st.name
  ) ORDER BY sh.created_at DESC), '[]'::jsonb)
  INTO v_shares
  FROM public.passport_shares sh
  LEFT JOIN public.stores st ON st.id = sh.used_by_store_id
  WHERE sh.holder_id = v_holder_id;

  RETURN v_shares;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.list_passport_shares(uuid) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.list_passport_shares(uuid) TO anon, authenticated;

-- 8. Holder-facing: revoke a share. Stops any further viewing or importing
--    through that token -- it never deletes what a shop already imported.
CREATE OR REPLACE FUNCTION public.revoke_passport_share(p_session_token uuid, p_share_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text;
  v_holder_id uuid;
  v_store_id uuid;
BEGIN
  v_phone := public._passport_session_phone(p_session_token);
  SELECT id INTO v_holder_id FROM public.passport_holders WHERE phone_e164 = v_phone;

  UPDATE public.passport_shares
  SET revoked_at = now()
  WHERE id = p_share_id AND holder_id = v_holder_id AND revoked_at IS NULL
  RETURNING used_by_store_id INTO v_store_id;

  IF FOUND THEN
    INSERT INTO public.passport_access_log (holder_id, store_id, action)
    VALUES (v_holder_id, v_store_id, 'revoked');
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.revoke_passport_share(uuid, uuid) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_passport_share(uuid, uuid) TO anon, authenticated;

-- 9. Store-facing (authenticated, store member): preview a share before
--    importing. Never returns data for a revoked/unknown link. Logs 'viewed'.
CREATE OR REPLACE FUNCTION public.get_passport_share_preview(p_share_token uuid, p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_share public.passport_shares%ROWTYPE;
  v_holder public.passport_holders%ROWTYPE;
  v_variants text[];
  v_latest record;
  v_found boolean;
BEGIN
  IF NOT public.is_store_member(p_store_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_share FROM public.passport_shares WHERE token = p_share_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  IF v_share.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'revoked');
  END IF;

  SELECT * INTO v_holder FROM public.passport_holders WHERE id = v_share.holder_id;
  v_variants := public._passport_phone_variants(v_holder.phone_e164);

  SELECT c.full_name, m.values, m.extra_fields, m.unit, m.taken_at
  INTO v_latest
  FROM public.measurement_sets m
  JOIN public.clients c ON c.id = m.client_id
  WHERE c.phone = ANY(v_variants) OR c.whatsapp_phone = ANY(v_variants) OR c.guardian_phone = ANY(v_variants)
  ORDER BY m.taken_at DESC
  LIMIT 1;
  v_found := FOUND;

  UPDATE public.passport_shares SET last_accessed_at = now() WHERE id = v_share.id;
  INSERT INTO public.passport_access_log (holder_id, store_id, action)
  VALUES (v_share.holder_id, p_store_id, 'viewed');

  IF NOT v_found THEN
    RETURN jsonb_build_object('status', 'empty');
  END IF;

  RETURN jsonb_build_object(
    'status', 'available',
    'full_name', v_latest.full_name,
    'values', v_latest.values,
    'extra_fields', v_latest.extra_fields,
    'unit', v_latest.unit,
    'taken_at', v_latest.taken_at
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_passport_share_preview(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_passport_share_preview(uuid, uuid) TO authenticated;

-- 10. Store-facing: import the latest measurements into this store's own
--     client record (creating it if needed). source = 'passport'.
CREATE OR REPLACE FUNCTION public.import_passport_share(p_share_token uuid, p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_share public.passport_shares%ROWTYPE;
  v_holder public.passport_holders%ROWTYPE;
  v_variants text[];
  v_latest record;
  v_found boolean;
  v_client_id uuid;
BEGIN
  IF NOT public.is_store_member(p_store_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_share FROM public.passport_shares WHERE token = p_share_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This share link is no longer valid' USING ERRCODE = 'P0131';
  END IF;
  IF v_share.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'This share link has been turned off' USING ERRCODE = 'P0132';
  END IF;

  SELECT * INTO v_holder FROM public.passport_holders WHERE id = v_share.holder_id;
  v_variants := public._passport_phone_variants(v_holder.phone_e164);

  SELECT c.full_name, m.values, m.extra_fields, m.unit, m.taken_at, m.notes
  INTO v_latest
  FROM public.measurement_sets m
  JOIN public.clients c ON c.id = m.client_id
  WHERE c.phone = ANY(v_variants) OR c.whatsapp_phone = ANY(v_variants) OR c.guardian_phone = ANY(v_variants)
  ORDER BY m.taken_at DESC
  LIMIT 1;
  v_found := FOUND;

  IF NOT v_found THEN
    RAISE EXCEPTION 'No measurements to import yet' USING ERRCODE = 'P0133';
  END IF;

  SELECT id INTO v_client_id FROM public.clients
  WHERE store_id = p_store_id AND phone = v_holder.phone_e164
  LIMIT 1;

  IF v_client_id IS NULL THEN
    INSERT INTO public.clients (store_id, full_name, phone)
    VALUES (p_store_id, v_latest.full_name, v_holder.phone_e164)
    RETURNING id INTO v_client_id;
  END IF;

  INSERT INTO public.measurement_sets
    (store_id, client_id, values, extra_fields, unit, notes, source, taken_at)
  VALUES
    (p_store_id, v_client_id, v_latest.values, v_latest.extra_fields, v_latest.unit,
     v_latest.notes, 'passport', v_latest.taken_at);

  UPDATE public.passport_shares
  SET used_by_store_id = p_store_id, last_accessed_at = now()
  WHERE id = v_share.id;

  INSERT INTO public.passport_access_log (holder_id, store_id, action)
  VALUES (v_share.holder_id, p_store_id, 'imported');

  RETURN jsonb_build_object('client_id', v_client_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.import_passport_share(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_passport_share(uuid, uuid) TO authenticated;

-- 11. Referral attribution -- called once, right after a new store signs up
--     through a Passport share link (see PENDING_PASSPORT_SHARE_KEY in
--     onboarding.tsx). A no-op if this store was already attributed.
CREATE OR REPLACE FUNCTION public.record_passport_referral(p_store_id uuid, p_share_token uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_share_id uuid;
BEGIN
  IF NOT public.is_store_member(p_store_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_share_id FROM public.passport_shares WHERE token = p_share_token;
  IF v_share_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.stores
  SET referred_by_passport_share_id = v_share_id
  WHERE id = p_store_id AND referred_by_passport_share_id IS NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.record_passport_referral(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_passport_referral(uuid, uuid) TO authenticated;

-- 12. Verification -- one row: all_true, and which checks (if any) failed.
SELECT
  bool_and(v) AS all_true,
  coalesce(string_agg(k, ', ') FILTER (WHERE NOT v), 'none') AS failed_checks
FROM (VALUES
  ('passport_holders_table', to_regclass('public.passport_holders') IS NOT NULL),
  ('passport_holders_rls', coalesce((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.passport_holders'::regclass), false)),
  ('passport_sessions_table', to_regclass('public.passport_sessions') IS NOT NULL),
  ('passport_shares_table', to_regclass('public.passport_shares') IS NOT NULL),
  ('passport_access_log_table', to_regclass('public.passport_access_log') IS NOT NULL),
  ('stores_referred_by_passport_share', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stores' AND column_name = 'referred_by_passport_share_id'
  )),
  ('passport_start_session_fn', to_regprocedure('public.passport_start_session(text)') IS NOT NULL),
  ('get_passport_view_fn', to_regprocedure('public.get_passport_view(uuid)') IS NOT NULL),
  ('create_passport_share_fn', to_regprocedure('public.create_passport_share(uuid)') IS NOT NULL),
  ('list_passport_shares_fn', to_regprocedure('public.list_passport_shares(uuid)') IS NOT NULL),
  ('revoke_passport_share_fn', to_regprocedure('public.revoke_passport_share(uuid,uuid)') IS NOT NULL),
  ('get_passport_share_preview_fn', to_regprocedure('public.get_passport_share_preview(uuid,uuid)') IS NOT NULL),
  ('import_passport_share_fn', to_regprocedure('public.import_passport_share(uuid,uuid)') IS NOT NULL),
  ('record_passport_referral_fn', to_regprocedure('public.record_passport_referral(uuid,uuid)') IS NOT NULL)
) AS checks(k, v);

COMMIT;
