-- 1. stores: new columns
ALTER TABLE public.stores
  ADD COLUMN cover_url text,
  ADD COLUMN legal_line text DEFAULT 'Jaylor is a product of Bethjay Global Enterprise Limited, RC [number].',
  ADD COLUMN timezone text NOT NULL DEFAULT 'Africa/Lagos',
  ADD COLUMN garment_types text[],
  ADD COLUMN sews_for text CHECK (sews_for IN ('female','male','both')),
  ADD COLUMN accent_color text,
  ADD COLUMN onboarding_completed boolean NOT NULL DEFAULT false;

-- 2. store_members: new columns
ALTER TABLE public.store_members
  ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','invited','removed')),
  ADD COLUMN invited_phone text;

-- 3. Owner-membership trigger already exists (on_store_created -> handle_new_store), confirmed in place.

-- 4. measurement_templates table
CREATE TABLE public.measurement_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  age_group text NOT NULL CHECK (age_group IN ('adult','teen','child','baby','any')),
  sex text NOT NULL CHECK (sex IN ('female','male','unisex')),
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  is_custom boolean NOT NULL DEFAULT false,
  hidden boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.measurement_templates TO authenticated;
GRANT ALL ON public.measurement_templates TO service_role;

ALTER TABLE public.measurement_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "measurement_templates_select_members"
  ON public.measurement_templates FOR SELECT
  TO authenticated
  USING (public.is_store_member(store_id));

CREATE POLICY "measurement_templates_insert_managers"
  ON public.measurement_templates FOR INSERT
  TO authenticated
  WITH CHECK (public.has_store_role(store_id, ARRAY['owner'::store_role, 'manager'::store_role]));

CREATE POLICY "measurement_templates_update_managers"
  ON public.measurement_templates FOR UPDATE
  TO authenticated
  USING (public.has_store_role(store_id, ARRAY['owner'::store_role, 'manager'::store_role]))
  WITH CHECK (public.has_store_role(store_id, ARRAY['owner'::store_role, 'manager'::store_role]));

CREATE POLICY "measurement_templates_delete_managers"
  ON public.measurement_templates FOR DELETE
  TO authenticated
  USING (public.has_store_role(store_id, ARRAY['owner'::store_role, 'manager'::store_role]));

-- Helper for building field objects (dropped at the end of this migration)
CREATE OR REPLACE FUNCTION public.jt_field(p_key text, p_label text, p_ord int, p_min numeric, p_max numeric)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'key', p_key,
    'label', p_label,
    'order', p_ord,
    'unit', 'in',
    'min', p_min,
    'max', p_max,
    'required', true
  );
$$;

-- 5. Seed trigger: seed every new store with the 8 default templates
CREATE OR REPLACE FUNCTION public.seed_measurement_templates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.measurement_templates (store_id, name, age_group, sex, fields, is_default, is_custom, hidden)
  VALUES
    (NEW.id, 'Adult female', 'adult', 'female',
      public.jt_field('bust','Bust',1,28,60) || public.jt_field('underbust','Underbust',2,24,50) || public.jt_field('waist','Waist',3,22,55) ||
      public.jt_field('hip','Hip',4,30,65) || public.jt_field('shoulder','Shoulder',5,12,22) || public.jt_field('sleeve_length','Sleeve length',6,5,30) ||
      public.jt_field('round_sleeve','Round sleeve',7,8,30) || public.jt_field('armhole','Armhole',8,12,26) || public.jt_field('dress_length','Dress length',9,30,70) ||
      public.jt_field('blouse_length','Blouse length',10,14,32) || public.jt_field('skirt_length','Skirt length',11,12,45) || public.jt_field('trouser_length','Trouser length',12,30,50) ||
      public.jt_field('thigh','Thigh',13,16,40) || public.jt_field('knee','Knee',14,12,26) || public.jt_field('ankle','Ankle',15,8,20) ||
      public.jt_field('neck','Neck',16,11,20) || public.jt_field('nipple_to_nipple','Nipple to nipple',17,6,16) || public.jt_field('shoulder_to_nipple','Shoulder to nipple',18,6,14) ||
      public.jt_field('shoulder_to_waist','Shoulder to waist',19,12,22),
      true, false, false),
    (NEW.id, 'Adult male', 'adult', 'male',
      public.jt_field('neck','Neck',1,12,22) || public.jt_field('chest','Chest',2,30,64) || public.jt_field('shoulder','Shoulder',3,14,24) ||
      public.jt_field('sleeve','Sleeve length',4,20,40) || public.jt_field('round_sleeve','Round sleeve',5,9,26) || public.jt_field('top_length','Top length',6,20,40) ||
      public.jt_field('agbada_length','Agbada length',7,40,70) || public.jt_field('waist','Waist',8,24,60) || public.jt_field('hip','Hip',9,30,60) ||
      public.jt_field('trouser_length','Trouser length',10,34,52) || public.jt_field('thigh','Thigh',11,16,36) || public.jt_field('knee','Knee',12,12,24) ||
      public.jt_field('bottom','Trouser bottom',13,12,26) || public.jt_field('cap_size','Cap size',14,20,26),
      true, false, false),
    (NEW.id, 'Teen girl (13-17)', 'teen', 'female',
      public.jt_field('height','Height',1,45,70) || public.jt_field('bust','Bust',2,24,40) || public.jt_field('underbust','Underbust',3,20,34) ||
      public.jt_field('waist','Waist',4,20,34) || public.jt_field('hip','Hip',5,26,42) || public.jt_field('shoulder','Shoulder',6,10,16) ||
      public.jt_field('sleeve_length','Sleeve length',7,4,24) || public.jt_field('round_sleeve','Round sleeve',8,7,16) || public.jt_field('blouse_length','Blouse length',9,12,24) ||
      public.jt_field('dress_length','Dress length',10,22,52) || public.jt_field('skirt_length','Skirt length',11,10,32) || public.jt_field('trouser_length','Trouser length',12,24,40) ||
      public.jt_field('thigh','Thigh',13,14,26),
      true, false, false),
    (NEW.id, 'Teen boy (13-17)', 'teen', 'male',
      public.jt_field('height','Height',1,45,72) || public.jt_field('neck','Neck',2,11,17) || public.jt_field('chest','Chest',3,24,42) ||
      public.jt_field('shoulder','Shoulder',4,11,18) || public.jt_field('sleeve','Sleeve length',5,14,30) || public.jt_field('round_sleeve','Round sleeve',6,7,18) ||
      public.jt_field('top_length','Top length',7,16,28) || public.jt_field('waist','Waist',8,20,38) || public.jt_field('hip','Hip',9,24,40) ||
      public.jt_field('trouser_length','Trouser length',10,26,42) || public.jt_field('thigh','Thigh',11,14,28) || public.jt_field('cap_size','Cap size',12,19,24),
      true, false, false),
    (NEW.id, 'Girl (3-12)', 'child', 'female',
      public.jt_field('height','Height',1,30,60) || public.jt_field('chest','Chest',2,18,32) || public.jt_field('waist','Waist',3,16,30) ||
      public.jt_field('hip','Hip',4,20,34) || public.jt_field('shoulder','Shoulder',5,8,13) || public.jt_field('sleeve_length','Sleeve length',6,3,18) ||
      public.jt_field('round_sleeve','Round sleeve',7,6,13) || public.jt_field('dress_length','Dress length',8,16,40) || public.jt_field('blouse_length','Blouse length',9,9,20) ||
      public.jt_field('skirt_length','Skirt length',10,7,24) || public.jt_field('trouser_length','Trouser length',11,16,32),
      true, false, false),
    (NEW.id, 'Boy (3-12)', 'child', 'male',
      public.jt_field('height','Height',1,30,62) || public.jt_field('neck','Neck',2,9,14) || public.jt_field('chest','Chest',3,18,32) ||
      public.jt_field('waist','Waist',4,16,28) || public.jt_field('shoulder','Shoulder',5,8,14) || public.jt_field('sleeve','Sleeve length',6,8,20) ||
      public.jt_field('round_sleeve','Round sleeve',7,6,13) || public.jt_field('top_length','Top length',8,11,24) || public.jt_field('trouser_length','Trouser length',9,16,34) ||
      public.jt_field('cap_size','Cap size',10,17,23),
      true, false, false),
    (NEW.id, 'Baby and toddler (0-2)', 'baby', 'unisex',
      public.jt_field('body_length','Body length',1,12,24) || public.jt_field('chest','Chest',2,14,22) || public.jt_field('waist','Waist',3,12,20) ||
      public.jt_field('shoulder','Shoulder',4,5,9) || public.jt_field('sleeve','Sleeve length',5,4,11) || public.jt_field('top_length','Top length',6,7,14) ||
      public.jt_field('trouser_length','Trouser length',7,8,18) || public.jt_field('head_circumference','Head circumference',8,13,20),
      true, false, false),
    (NEW.id, 'Free size / unisex', 'any', 'unisex',
      public.jt_field('chest','Chest',1,28,60) || public.jt_field('waist','Waist',2,22,55) || public.jt_field('hip','Hip',3,30,65) ||
      public.jt_field('length','Length',4,20,60),
      true, false, false);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_store_seeded
  AFTER INSERT ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.seed_measurement_templates();

-- Seed any stores that already exist
INSERT INTO public.measurement_templates (store_id, name, age_group, sex, fields, is_default, is_custom, hidden)
SELECT s.id, v.name, v.age_group, v.sex, v.fields, true, false, false
FROM public.stores s
CROSS JOIN (VALUES
  ('Adult female','adult','female',
    public.jt_field('bust','Bust',1,28,60) || public.jt_field('underbust','Underbust',2,24,50) || public.jt_field('waist','Waist',3,22,55) ||
    public.jt_field('hip','Hip',4,30,65) || public.jt_field('shoulder','Shoulder',5,12,22) || public.jt_field('sleeve_length','Sleeve length',6,5,30) ||
    public.jt_field('round_sleeve','Round sleeve',7,8,30) || public.jt_field('armhole','Armhole',8,12,26) || public.jt_field('dress_length','Dress length',9,30,70) ||
    public.jt_field('blouse_length','Blouse length',10,14,32) || public.jt_field('skirt_length','Skirt length',11,12,45) || public.jt_field('trouser_length','Trouser length',12,30,50) ||
    public.jt_field('thigh','Thigh',13,16,40) || public.jt_field('knee','Knee',14,12,26) || public.jt_field('ankle','Ankle',15,8,20) ||
    public.jt_field('neck','Neck',16,11,20) || public.jt_field('nipple_to_nipple','Nipple to nipple',17,6,16) || public.jt_field('shoulder_to_nipple','Shoulder to nipple',18,6,14) ||
    public.jt_field('shoulder_to_waist','Shoulder to waist',19,12,22)),
  ('Adult male','adult','male',
    public.jt_field('neck','Neck',1,12,22) || public.jt_field('chest','Chest',2,30,64) || public.jt_field('shoulder','Shoulder',3,14,24) ||
    public.jt_field('sleeve','Sleeve length',4,20,40) || public.jt_field('round_sleeve','Round sleeve',5,9,26) || public.jt_field('top_length','Top length',6,20,40) ||
    public.jt_field('agbada_length','Agbada length',7,40,70) || public.jt_field('waist','Waist',8,24,60) || public.jt_field('hip','Hip',9,30,60) ||
    public.jt_field('trouser_length','Trouser length',10,34,52) || public.jt_field('thigh','Thigh',11,16,36) || public.jt_field('knee','Knee',12,12,24) ||
    public.jt_field('bottom','Trouser bottom',13,12,26) || public.jt_field('cap_size','Cap size',14,20,26)),
  ('Teen girl (13-17)','teen','female',
    public.jt_field('height','Height',1,45,70) || public.jt_field('bust','Bust',2,24,40) || public.jt_field('underbust','Underbust',3,20,34) ||
    public.jt_field('waist','Waist',4,20,34) || public.jt_field('hip','Hip',5,26,42) || public.jt_field('shoulder','Shoulder',6,10,16) ||
    public.jt_field('sleeve_length','Sleeve length',7,4,24) || public.jt_field('round_sleeve','Round sleeve',8,7,16) || public.jt_field('blouse_length','Blouse length',9,12,24) ||
    public.jt_field('dress_length','Dress length',10,22,52) || public.jt_field('skirt_length','Skirt length',11,10,32) || public.jt_field('trouser_length','Trouser length',12,24,40) ||
    public.jt_field('thigh','Thigh',13,14,26)),
  ('Teen boy (13-17)','teen','male',
    public.jt_field('height','Height',1,45,72) || public.jt_field('neck','Neck',2,11,17) || public.jt_field('chest','Chest',3,24,42) ||
    public.jt_field('shoulder','Shoulder',4,11,18) || public.jt_field('sleeve','Sleeve length',5,14,30) || public.jt_field('round_sleeve','Round sleeve',6,7,18) ||
    public.jt_field('top_length','Top length',7,16,28) || public.jt_field('waist','Waist',8,20,38) || public.jt_field('hip','Hip',9,24,40) ||
    public.jt_field('trouser_length','Trouser length',10,26,42) || public.jt_field('thigh','Thigh',11,14,28) || public.jt_field('cap_size','Cap size',12,19,24)),
  ('Girl (3-12)','child','female',
    public.jt_field('height','Height',1,30,60) || public.jt_field('chest','Chest',2,18,32) || public.jt_field('waist','Waist',3,16,30) ||
    public.jt_field('hip','Hip',4,20,34) || public.jt_field('shoulder','Shoulder',5,8,13) || public.jt_field('sleeve_length','Sleeve length',6,3,18) ||
    public.jt_field('round_sleeve','Round sleeve',7,6,13) || public.jt_field('dress_length','Dress length',8,16,40) || public.jt_field('blouse_length','Blouse length',9,9,20) ||
    public.jt_field('skirt_length','Skirt length',10,7,24) || public.jt_field('trouser_length','Trouser length',11,16,32)),
  ('Boy (3-12)','child','male',
    public.jt_field('height','Height',1,30,62) || public.jt_field('neck','Neck',2,9,14) || public.jt_field('chest','Chest',3,18,32) ||
    public.jt_field('waist','Waist',4,16,28) || public.jt_field('shoulder','Shoulder',5,8,14) || public.jt_field('sleeve','Sleeve length',6,8,20) ||
    public.jt_field('round_sleeve','Round sleeve',7,6,13) || public.jt_field('top_length','Top length',8,11,24) || public.jt_field('trouser_length','Trouser length',9,16,34) ||
    public.jt_field('cap_size','Cap size',10,17,23)),
  ('Baby and toddler (0-2)','baby','unisex',
    public.jt_field('body_length','Body length',1,12,24) || public.jt_field('chest','Chest',2,14,22) || public.jt_field('waist','Waist',3,12,20) ||
    public.jt_field('shoulder','Shoulder',4,5,9) || public.jt_field('sleeve','Sleeve length',5,4,11) || public.jt_field('top_length','Top length',6,7,14) ||
    public.jt_field('trouser_length','Trouser length',7,8,18) || public.jt_field('head_circumference','Head circumference',8,13,20)),
  ('Free size / unisex','any','unisex',
    public.jt_field('chest','Chest',1,28,60) || public.jt_field('waist','Waist',2,22,55) || public.jt_field('hip','Hip',3,30,65) ||
    public.jt_field('length','Length',4,20,60))
) AS v(name, age_group, sex, fields)
WHERE NOT EXISTS (
  SELECT 1 FROM public.measurement_templates t WHERE t.store_id = s.id AND t.is_default
);

DROP FUNCTION public.jt_field(text, text, int, numeric, numeric);
