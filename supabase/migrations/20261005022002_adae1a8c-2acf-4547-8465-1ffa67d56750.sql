DO $$ DECLARE t text; p text; BEGIN
FOR t,p IN SELECT * FROM (VALUES ('ai_plan_allowances','signed in read allowances'),('ai_feature_costs','signed in read costs'),('ai_credit_packs','signed in read packs')) v LOOP
EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p, t);
EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.store_members m WHERE m.user_id = auth.uid() AND m.status = ''active''))', p, t);
END LOOP; END $$;