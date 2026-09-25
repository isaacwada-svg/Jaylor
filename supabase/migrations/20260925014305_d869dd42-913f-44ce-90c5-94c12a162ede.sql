DROP POLICY IF EXISTS plans_signed_in_read ON public.plans;
CREATE POLICY plans_active_store_members_read
ON public.plans
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.store_members AS membership
    WHERE membership.user_id = auth.uid()
      AND membership.status = 'active'
  )
);

DROP POLICY IF EXISTS calendar_event_defs_signed_in_read ON public.calendar_event_defs;
CREATE POLICY calendar_event_defs_active_store_members_read
ON public.calendar_event_defs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.store_members AS membership
    WHERE membership.user_id = auth.uid()
      AND membership.status = 'active'
  )
);