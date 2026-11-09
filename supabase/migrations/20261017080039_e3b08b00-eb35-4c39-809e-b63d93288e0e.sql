CREATE TABLE public.store_nav_pins (
  store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  pinned_keys text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_nav_pins_known_keys CHECK (
    pinned_keys <@ ARRAY[
      'fittings','shop','events','quotations','contracts','payroll','my-earnings',
      'staff','business-report','inventory','reports','moments','ai','directory',
      'privacy','support'
    ]::text[]
  )
);

GRANT SELECT, INSERT, UPDATE ON public.store_nav_pins TO authenticated;
GRANT ALL ON public.store_nav_pins TO service_role;

ALTER TABLE public.store_nav_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Store members view nav pins"
ON public.store_nav_pins
FOR SELECT TO authenticated
USING (public.is_store_member(store_id));

CREATE POLICY "Store members create nav pins"
ON public.store_nav_pins
FOR INSERT TO authenticated
WITH CHECK (public.is_store_member(store_id));

CREATE POLICY "Store members update nav pins"
ON public.store_nav_pins
FOR UPDATE TO authenticated
USING (public.is_store_member(store_id))
WITH CHECK (public.is_store_member(store_id));

CREATE OR REPLACE FUNCTION public.touch_store_nav_pins_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_store_nav_pins_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.touch_store_nav_pins_updated_at() TO service_role;

CREATE TRIGGER touch_store_nav_pins_updated_at
BEFORE UPDATE ON public.store_nav_pins
FOR EACH ROW EXECUTE FUNCTION public.touch_store_nav_pins_updated_at();

CREATE OR REPLACE FUNCTION public.seed_store_nav_pins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.store_nav_pins (store_id)
  VALUES (NEW.id)
  ON CONFLICT (store_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_store_nav_pins() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_store_nav_pins() TO service_role;

CREATE TRIGGER seed_store_nav_pins_after_store
AFTER INSERT ON public.stores
FOR EACH ROW EXECUTE FUNCTION public.seed_store_nav_pins();

INSERT INTO public.store_nav_pins (store_id)
SELECT id FROM public.stores
ON CONFLICT (store_id) DO NOTHING;
