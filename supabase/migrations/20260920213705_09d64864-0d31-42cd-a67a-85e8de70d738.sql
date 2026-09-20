-- Storefront photos: replace blanket public read with published-only public read.
DROP POLICY IF EXISTS storefront_photos_public_read ON storage.objects;

CREATE POLICY storefront_photos_published_read ON storage.objects
FOR SELECT TO anon, authenticated
USING (
  bucket_id = 'storefront-photos'
  AND EXISTS (
    SELECT 1
    FROM public.storefront_items si
    WHERE si.published = true
      AND si.store_id::text = split_part(storage.objects.name, '/', 1)
      AND EXISTS (
        SELECT 1 FROM unnest(si.photos) AS p
        WHERE p = storage.objects.name OR p LIKE '%/' || storage.objects.name
      )
  )
);

CREATE POLICY storefront_photos_member_read ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'storefront-photos'
  AND public.is_store_member((split_part(storage.objects.name, '/', 1))::uuid)
);

-- Internal trigger helpers should not be callable through the API.
REVOKE ALL ON FUNCTION public.generate_referral_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_referral_reward() FROM PUBLIC, anon, authenticated;
