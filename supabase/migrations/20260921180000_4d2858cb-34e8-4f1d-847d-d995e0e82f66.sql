-- Security fix L6 (Medium): sew_requests carried two legacy PERMISSIVE
-- policies alongside their already-validated replacements. Permissive
-- policies are OR-ed together, so the blanket "Anyone can submit a sew
-- request" (WITH CHECK (true)) made sew_requests_public_insert's
-- validation (store exists, item published) unreachable, and "Store
-- members update sew requests" (any member) downgraded
-- sew_requests_member_update's owner/manager-only restriction to any
-- store member. Dropping the two legacy policies leaves only the
-- validated pair in effect — the same cleanup already done for
-- consultation_requests.

DROP POLICY IF EXISTS "Anyone can submit a sew request" ON public.sew_requests;
DROP POLICY IF EXISTS "Store members update sew requests" ON public.sew_requests;
