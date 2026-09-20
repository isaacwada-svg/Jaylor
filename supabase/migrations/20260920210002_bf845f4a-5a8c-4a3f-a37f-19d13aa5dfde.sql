
-- 1. Let logged-out visitors read only the public columns of active shops (needed by stores_public).
REVOKE SELECT ON public.stores FROM anon;
GRANT SELECT (id, name, slug, logo_url, accent_color, city, cover_url, bio, whatsapp_phone, opening_hours) ON public.stores TO anon;
DROP POLICY IF EXISTS stores_select_public ON public.stores;
CREATE POLICY stores_select_public ON public.stores FOR SELECT TO anon USING (is_active = true);

-- 2. Scope staff-only policies to signed-in users so logged-out reads never hit member helper functions.
DROP POLICY IF EXISTS "Anyone can view published items" ON public.storefront_items;
CREATE POLICY "Anyone can view published items" ON public.storefront_items FOR SELECT TO anon, authenticated USING (published = true);
DROP POLICY IF EXISTS "Store members can view their items" ON public.storefront_items;
CREATE POLICY "Store members can view their items" ON public.storefront_items FOR SELECT TO authenticated USING (is_store_member(store_id));
DROP POLICY IF EXISTS "Owners and managers create items" ON public.storefront_items;
CREATE POLICY "Owners and managers create items" ON public.storefront_items FOR INSERT TO authenticated WITH CHECK (has_store_role(store_id, ARRAY['owner'::store_role,'manager'::store_role]));
DROP POLICY IF EXISTS "Owners and managers update items" ON public.storefront_items;
CREATE POLICY "Owners and managers update items" ON public.storefront_items FOR UPDATE TO authenticated USING (has_store_role(store_id, ARRAY['owner'::store_role,'manager'::store_role]));
DROP POLICY IF EXISTS "Owners and managers delete items" ON public.storefront_items;
CREATE POLICY "Owners and managers delete items" ON public.storefront_items FOR DELETE TO authenticated USING (has_store_role(store_id, ARRAY['owner'::store_role,'manager'::store_role]));

DROP POLICY IF EXISTS ai_designs_member_select ON public.ai_designs;
CREATE POLICY ai_designs_member_select ON public.ai_designs FOR SELECT TO authenticated USING (has_store_role(store_id, ARRAY['owner'::store_role,'manager'::store_role,'tailor'::store_role]));

DROP POLICY IF EXISTS "Store members can view sew requests" ON public.sew_requests;
CREATE POLICY "Store members can view sew requests" ON public.sew_requests FOR SELECT TO authenticated USING (is_store_member(store_id));
DROP POLICY IF EXISTS "Store members update sew requests" ON public.sew_requests;
CREATE POLICY "Store members update sew requests" ON public.sew_requests FOR UPDATE TO authenticated USING (is_store_member(store_id));
DROP POLICY IF EXISTS sew_requests_member_select ON public.sew_requests;
CREATE POLICY sew_requests_member_select ON public.sew_requests FOR SELECT TO authenticated USING (has_store_role(store_id, ARRAY['owner'::store_role,'manager'::store_role,'tailor'::store_role]));
DROP POLICY IF EXISTS sew_requests_member_update ON public.sew_requests;
CREATE POLICY sew_requests_member_update ON public.sew_requests FOR UPDATE TO authenticated USING (has_store_role(store_id, ARRAY['owner'::store_role,'manager'::store_role]));

DROP POLICY IF EXISTS "Store members manage events" ON public.events;
CREATE POLICY "Store members manage events" ON public.events FOR ALL TO authenticated USING (is_store_member(store_id)) WITH CHECK (is_store_member(store_id));
DROP POLICY IF EXISTS "Store members manage participants" ON public.event_participants;
CREATE POLICY "Store members manage participants" ON public.event_participants FOR ALL TO authenticated USING (is_store_member(store_id)) WITH CHECK (is_store_member(store_id));

DROP POLICY IF EXISTS "Platform admins can view leads" ON public.leads;
CREATE POLICY "Platform admins can view leads" ON public.leads FOR SELECT TO authenticated USING (is_platform_admin());
