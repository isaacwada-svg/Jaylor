CREATE POLICY "ai-studio members read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'ai-studio' AND public.is_store_member(((storage.foldername(name))[1])::uuid));
CREATE POLICY "ai-studio members upload inputs" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'ai-studio' AND (storage.foldername(name))[2] = 'inputs' AND public.is_store_member(((storage.foldername(name))[1])::uuid));