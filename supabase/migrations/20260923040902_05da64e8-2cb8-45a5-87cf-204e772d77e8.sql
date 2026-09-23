CREATE TABLE public.store_feature_discovery (
  store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  features_used text[] NOT NULL DEFAULT '{}'::text[],
  tour_dismissed_at timestamptz,
  tour_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_feature_discovery_known_features CHECK (
    features_used <@ ARRAY['ai_design','voice_order','measurement_passport','group_orders']::text[]
  )
);

GRANT SELECT, INSERT, UPDATE ON public.store_feature_discovery TO authenticated;
GRANT ALL ON public.store_feature_discovery TO service_role;

ALTER TABLE public.store_feature_discovery ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners and managers view feature discovery"
ON public.store_feature_discovery
FOR SELECT TO authenticated
USING (public.has_store_role(store_id, ARRAY['owner'::public.store_role, 'manager'::public.store_role]));

CREATE POLICY "Owners create feature discovery"
ON public.store_feature_discovery
FOR INSERT TO authenticated
WITH CHECK (public.has_store_role(store_id, ARRAY['owner'::public.store_role]));

CREATE POLICY "Owners update feature discovery"
ON public.store_feature_discovery
FOR UPDATE TO authenticated
USING (public.has_store_role(store_id, ARRAY['owner'::public.store_role]))
WITH CHECK (public.has_store_role(store_id, ARRAY['owner'::public.store_role]));

CREATE OR REPLACE FUNCTION public.touch_store_feature_discovery_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_store_feature_discovery_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.touch_store_feature_discovery_updated_at() TO service_role;

CREATE TRIGGER touch_store_feature_discovery_updated_at
BEFORE UPDATE ON public.store_feature_discovery
FOR EACH ROW EXECUTE FUNCTION public.touch_store_feature_discovery_updated_at();

CREATE OR REPLACE FUNCTION public.seed_store_feature_discovery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.store_feature_discovery (store_id)
  VALUES (NEW.id)
  ON CONFLICT (store_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_store_feature_discovery() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_store_feature_discovery() TO service_role;

CREATE TRIGGER seed_store_feature_discovery_after_store
AFTER INSERT ON public.stores
FOR EACH ROW EXECUTE FUNCTION public.seed_store_feature_discovery();

INSERT INTO public.store_feature_discovery (store_id)
SELECT id FROM public.stores
ON CONFLICT (store_id) DO NOTHING;