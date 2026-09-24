DROP POLICY IF EXISTS plans_public_read ON public.plans;
CREATE POLICY plans_signed_in_read ON public.plans FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS garment_types_public_read ON public.garment_types;
CREATE POLICY garment_types_signed_in_read ON public.garment_types FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL AND is_active);

DROP POLICY IF EXISTS calendar_event_defs_public_read ON public.calendar_event_defs;
CREATE POLICY calendar_event_defs_signed_in_read ON public.calendar_event_defs FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS country_configs_public_read ON public.country_configs;
CREATE POLICY country_configs_signed_in_read ON public.country_configs FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL AND is_active);

REVOKE SELECT ON public.plans, public.garment_types, public.calendar_event_defs, public.country_configs FROM anon;

DROP POLICY IF EXISTS "Anyone can submit a lead" ON public.leads;
CREATE POLICY "Visitors can submit a valid lead" ON public.leads FOR INSERT TO anon, authenticated
WITH CHECK (
  char_length(btrim(name)) BETWEEN 1 AND 120
  AND source IN ('custom_tier','notebook_import')
  AND (phone IS NULL OR phone ~ '^[0-9+() -]{7,20}$')
  AND (email IS NULL OR (char_length(email) <= 254 AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'))
  AND (message IS NULL OR char_length(message) <= 2000)
);
GRANT INSERT ON public.leads TO authenticated;