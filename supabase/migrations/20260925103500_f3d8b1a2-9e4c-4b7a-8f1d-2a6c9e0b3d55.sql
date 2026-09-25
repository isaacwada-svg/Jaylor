DROP POLICY IF EXISTS "Visitors can submit a valid lead" ON public.leads;
CREATE POLICY "Visitors can submit a valid lead" ON public.leads FOR INSERT TO anon, authenticated
WITH CHECK (
  char_length(btrim(name)) BETWEEN 1 AND 120
  AND source IN ('custom_tier','notebook_import','contact')
  AND (phone IS NULL OR phone ~ '^[0-9+() -]{7,20}$')
  AND (email IS NULL OR (char_length(email) <= 254 AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'))
  AND (message IS NULL OR char_length(message) <= 2000)
);
