ALTER TABLE public.job_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_templates FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_templates TO authenticated;
GRANT ALL ON public.job_templates TO service_role;

DROP POLICY IF EXISTS "job_templates_select_members" ON public.job_templates;
DROP POLICY IF EXISTS "job_templates_insert_managers" ON public.job_templates;
DROP POLICY IF EXISTS "job_templates_update_managers" ON public.job_templates;
DROP POLICY IF EXISTS "job_templates_delete_managers" ON public.job_templates;

CREATE POLICY "job_templates_select_members" ON public.job_templates FOR SELECT TO authenticated
  USING (public.is_store_member(store_id));
CREATE POLICY "job_templates_insert_managers" ON public.job_templates FOR INSERT TO authenticated
  WITH CHECK (public.has_store_role(store_id, ARRAY['owner'::store_role,'manager'::store_role]) AND is_default = false);
CREATE POLICY "job_templates_update_managers" ON public.job_templates FOR UPDATE TO authenticated
  USING (public.has_store_role(store_id, ARRAY['owner'::store_role,'manager'::store_role]))
  WITH CHECK (public.has_store_role(store_id, ARRAY['owner'::store_role,'manager'::store_role]));
CREATE POLICY "job_templates_delete_managers" ON public.job_templates FOR DELETE TO authenticated
  USING (public.has_store_role(store_id, ARRAY['owner'::store_role,'manager'::store_role]) AND is_default = false);