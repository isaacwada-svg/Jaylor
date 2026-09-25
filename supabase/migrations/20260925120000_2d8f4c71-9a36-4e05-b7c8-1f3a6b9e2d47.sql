-- job_templates: per-store, customizable version of the "what kind of job?"
-- picker (previously a fixed, hardcoded list). Same shape as the
-- measurement_templates precedent: every store is seeded with the built-in
-- set (is_default = true), which can be hidden but not deleted (their
-- job_type values are relied on for historical events' structural fields);
-- store owners/managers can also add their own fully custom ones.
CREATE TABLE public.job_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  job_type text NOT NULL,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  name_placeholder text NOT NULL DEFAULT '',
  payer_mode text NOT NULL CHECK (payer_mode IN ('each_pays', 'single_payer', 'mixed')),
  collection_mode text NOT NULL CHECK (collection_mode IN ('measurements', 'sizes', 'none')),
  pricing_mode text NOT NULL CHECK (pricing_mode IN ('flat', 'by_garment', 'quantity_tiers')),
  turnaround_mode text NOT NULL CHECK (turnaround_mode IN ('standard', 'rush')),
  guest_welcome_line text NOT NULL DEFAULT 'Hi {name}, welcome to the group order.',
  is_contract boolean NOT NULL DEFAULT false,
  is_default boolean NOT NULL DEFAULT false,
  hidden boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 100,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, job_type)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_templates TO authenticated;
GRANT ALL ON public.job_templates TO service_role;

ALTER TABLE public.job_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_templates_select_members"
  ON public.job_templates FOR SELECT
  TO authenticated
  USING (public.is_store_member(store_id));

CREATE POLICY "job_templates_insert_managers"
  ON public.job_templates FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_store_role(store_id, ARRAY['owner'::store_role, 'manager'::store_role])
    AND is_default = false
  );

CREATE POLICY "job_templates_update_managers"
  ON public.job_templates FOR UPDATE
  TO authenticated
  USING (public.has_store_role(store_id, ARRAY['owner'::store_role, 'manager'::store_role]))
  WITH CHECK (
    public.has_store_role(store_id, ARRAY['owner'::store_role, 'manager'::store_role])
    -- Built-ins can only have `hidden` toggled -- their structural fields
    -- stay fixed since existing events already rely on their exact shape.
    AND (is_default = false OR job_type IN (
      'aso_ebi','burial','family_occasion','association','school_uniform',
      'corporate_uniform','sports_team','diaspora','remote_individual','ready_to_wear'
    ))
  );

CREATE POLICY "job_templates_delete_managers"
  ON public.job_templates FOR DELETE
  TO authenticated
  USING (
    public.has_store_role(store_id, ARRAY['owner'::store_role, 'manager'::store_role])
    AND is_default = false
  );

CREATE OR REPLACE FUNCTION public.seed_job_templates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.job_templates (
    store_id, job_type, label, description, name_placeholder,
    payer_mode, collection_mode, pricing_mode, turnaround_mode,
    guest_welcome_line, is_contract, is_default, sort_order
  )
  VALUES
    (NEW.id, 'aso_ebi', 'Aso-ebi',
      'A wedding or owambe — each guest measures and pays their own share.',
      'Adeyemi wedding aso-ebi', 'each_pays', 'measurements', 'flat', 'standard',
      'Hi {name}, welcome to the group order.', false, true, 0),
    (NEW.id, 'burial', 'Burial',
      'Short notice, family aso-ebi for a funeral — rush turnaround by default.',
      'Chief Okafor burial aso-ebi', 'each_pays', 'measurements', 'flat', 'rush',
      'Hi {name}, our condolences. Here''s the group order for the burial.', false, true, 1),
    (NEW.id, 'family_occasion', 'Family occasion',
      'Christmas, Sallah, naming or a birthday — one parent usually pays for all.',
      'Family Christmas outfits', 'single_payer', 'measurements', 'flat', 'standard',
      'Hi {name}, please confirm your measurements for this occasion.', false, true, 2),
    (NEW.id, 'association', 'Church or association',
      'Uniforms for a church, mosque or association — members pay their own way.',
      'Women''s fellowship uniform', 'each_pays', 'measurements', 'flat', 'standard',
      'Hi {name}, welcome to the group uniform order.', false, true, 3),
    (NEW.id, 'school_uniform', 'School uniforms',
      'A school''s own uniform contract, sized rather than measured, term after term.',
      'Bright Stars School uniforms — 1st term', 'single_payer', 'sizes', 'quantity_tiers', 'standard',
      'Hi {name}, please confirm your size for the school uniform.', true, true, 4),
    (NEW.id, 'corporate_uniform', 'Company uniforms',
      'Staff uniforms for a company or hotel — a formal quote and invoice.',
      'Lagos Continental Hotel staff uniforms', 'single_payer', 'sizes', 'quantity_tiers', 'standard',
      'Hi {name}, please confirm your size for the staff uniform.', true, true, 5),
    (NEW.id, 'sports_team', 'Team kit',
      'Kit for a sports team or campaign crew, by name and number.',
      'Eagles FC away kit', 'single_payer', 'sizes', 'flat', 'standard',
      'Hi {name}, please confirm your size for the team kit.', false, true, 6),
    (NEW.id, 'diaspora', 'Order from abroad',
      'A client outside Nigeria — self-measure, pay by card, ship to them.',
      'Order for Chidinma — London', 'each_pays', 'measurements', 'flat', 'standard',
      'Hi {name}, welcome — let''s get your measurements for your order abroad.', false, true, 7),
    (NEW.id, 'remote_individual', 'One client, remote',
      'A single client who can''t come in — send one measure-and-pay link.',
      'Order for Blessing', 'each_pays', 'measurements', 'flat', 'standard',
      'Hi {name}, welcome — let''s get your measurements sorted remotely.', false, true, 8),
    (NEW.id, 'ready_to_wear', 'Pre-order a collection',
      'Buyers pick a size and quantity from a small catalogue and pay upfront.',
      'December collection pre-order', 'each_pays', 'sizes', 'flat', 'standard',
      'Hi {name}, welcome — pick your size to pre-order.', false, true, 9);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_store_seeded_job_templates
  AFTER INSERT ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.seed_job_templates();

-- Seed any stores that already exist
INSERT INTO public.job_templates (
  store_id, job_type, label, description, name_placeholder,
  payer_mode, collection_mode, pricing_mode, turnaround_mode,
  guest_welcome_line, is_contract, is_default, sort_order
)
SELECT s.id, v.job_type, v.label, v.description, v.name_placeholder,
  v.payer_mode, v.collection_mode, v.pricing_mode, v.turnaround_mode,
  v.guest_welcome_line, v.is_contract, true, v.sort_order
FROM public.stores s
CROSS JOIN (VALUES
  ('aso_ebi', 'Aso-ebi',
    'A wedding or owambe — each guest measures and pays their own share.',
    'Adeyemi wedding aso-ebi', 'each_pays', 'measurements', 'flat', 'standard',
    'Hi {name}, welcome to the group order.', false, 0),
  ('burial', 'Burial',
    'Short notice, family aso-ebi for a funeral — rush turnaround by default.',
    'Chief Okafor burial aso-ebi', 'each_pays', 'measurements', 'flat', 'rush',
    'Hi {name}, our condolences. Here''s the group order for the burial.', false, 1),
  ('family_occasion', 'Family occasion',
    'Christmas, Sallah, naming or a birthday — one parent usually pays for all.',
    'Family Christmas outfits', 'single_payer', 'measurements', 'flat', 'standard',
    'Hi {name}, please confirm your measurements for this occasion.', false, 2),
  ('association', 'Church or association',
    'Uniforms for a church, mosque or association — members pay their own way.',
    'Women''s fellowship uniform', 'each_pays', 'measurements', 'flat', 'standard',
    'Hi {name}, welcome to the group uniform order.', false, 3),
  ('school_uniform', 'School uniforms',
    'A school''s own uniform contract, sized rather than measured, term after term.',
    'Bright Stars School uniforms — 1st term', 'single_payer', 'sizes', 'quantity_tiers', 'standard',
    'Hi {name}, please confirm your size for the school uniform.', true, 4),
  ('corporate_uniform', 'Company uniforms',
    'Staff uniforms for a company or hotel — a formal quote and invoice.',
    'Lagos Continental Hotel staff uniforms', 'single_payer', 'sizes', 'quantity_tiers', 'standard',
    'Hi {name}, please confirm your size for the staff uniform.', true, 5),
  ('sports_team', 'Team kit',
    'Kit for a sports team or campaign crew, by name and number.',
    'Eagles FC away kit', 'single_payer', 'sizes', 'flat', 'standard',
    'Hi {name}, please confirm your size for the team kit.', false, 6),
  ('diaspora', 'Order from abroad',
    'A client outside Nigeria — self-measure, pay by card, ship to them.',
    'Order for Chidinma — London', 'each_pays', 'measurements', 'flat', 'standard',
    'Hi {name}, welcome — let''s get your measurements for your order abroad.', false, 7),
  ('remote_individual', 'One client, remote',
    'A single client who can''t come in — send one measure-and-pay link.',
    'Order for Blessing', 'each_pays', 'measurements', 'flat', 'standard',
    'Hi {name}, welcome — let''s get your measurements sorted remotely.', false, 8),
  ('ready_to_wear', 'Pre-order a collection',
    'Buyers pick a size and quantity from a small catalogue and pay upfront.',
    'December collection pre-order', 'each_pays', 'sizes', 'flat', 'standard',
    'Hi {name}, welcome — pick your size to pre-order.', false, 9)
) AS v(job_type, label, description, name_placeholder, payer_mode, collection_mode,
       pricing_mode, turnaround_mode, guest_welcome_line, is_contract, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.job_templates t WHERE t.store_id = s.id AND t.is_default
);
