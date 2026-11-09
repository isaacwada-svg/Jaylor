ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attachment_paths text[] NOT NULL DEFAULT '{}'::text[];

DROP POLICY IF EXISTS "Visitors can submit a valid lead" ON public.leads;
CREATE POLICY "Visitors can submit a valid lead" ON public.leads FOR INSERT TO anon, authenticated
WITH CHECK (
  char_length(btrim(name)) BETWEEN 1 AND 120
  AND source IN ('custom_tier','notebook_import','contact','in_app_support')
  AND (phone IS NULL OR phone ~ '^[0-9+() -]{7,20}$')
  AND (email IS NULL OR (char_length(email) <= 254 AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'))
  AND (message IS NULL OR char_length(message) <= 2000)
  AND cardinality(attachment_paths) <= 5
  AND (
    (source = 'in_app_support' AND store_id IS NOT NULL AND public.is_store_member(store_id))
    OR (source <> 'in_app_support' AND store_id IS NULL AND cardinality(attachment_paths) = 0)
  )
);

-- Lets platform admins open the screenshots a logged-in store attaches to an
-- in-app support request. Store members already have their own read policy
-- on this bucket (20260929090257); this adds the admin-side read.
CREATE POLICY "Platform admins read attachments" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'attachments' AND public.is_platform_admin());
