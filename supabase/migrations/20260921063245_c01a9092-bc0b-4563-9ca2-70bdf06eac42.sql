DROP POLICY IF EXISTS consultation_requests_insert_public ON public.consultation_requests;
CREATE POLICY consultation_requests_insert_public
ON public.consultation_requests
FOR INSERT
TO anon, authenticated
WITH CHECK (
  status = 'pending'
  AND consultation_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = consultation_requests.store_id
      AND s.is_active = true
  )
);