-- PR E: fabric intake photos (all plans).
--
-- Extends order_materials (no parallel table) with a photo array, who/when
-- it was received, and free-text extras. Private storage bucket, member
-- read/insert, owner/manager delete. Safe to run more than once.

BEGIN;

-- 1. New columns. photo_urls is a volatile-safe ADD COLUMN (constant default
--    '{}'), so this is a fast metadata-only change; the backfill below fills
--    it in from the legacy single photo_url column.
ALTER TABLE public.order_materials
  ADD COLUMN IF NOT EXISTS photo_urls text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS received_by uuid,
  ADD COLUMN IF NOT EXISTS received_at timestamptz,
  ADD COLUMN IF NOT EXISTS extras_received text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_materials_photo_urls_max6'
  ) THEN
    ALTER TABLE public.order_materials
      ADD CONSTRAINT order_materials_photo_urls_max6
      CHECK (array_length(photo_urls, 1) IS NULL OR array_length(photo_urls, 1) <= 6);
  END IF;
END $$;

-- Backfill: carry the legacy single photo into the new array for any
-- existing row that has one and hasn't been backfilled yet.
UPDATE public.order_materials
SET photo_urls = ARRAY[photo_url]
WHERE photo_url IS NOT NULL
  AND (photo_urls IS NULL OR array_length(photo_urls, 1) IS NULL);

-- 2. Private bucket for fabric/material photos, member-scoped by store
--    folder -- same posture as order-style-photos and order-progress-photos.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'order-materials',
  'order-materials',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS order_materials_photos_member_read ON storage.objects;
CREATE POLICY order_materials_photos_member_read
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'order-materials'
    AND is_store_member((split_part(name, '/', 1))::uuid)
  );

DROP POLICY IF EXISTS order_materials_photos_member_insert ON storage.objects;
CREATE POLICY order_materials_photos_member_insert
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'order-materials'
    AND is_store_member((split_part(name, '/', 1))::uuid)
  );

-- Only owner/manager may delete the underlying object directly (e.g. a
-- future admin tool). The app's own removal path never calls this for
-- photos still referenced by a sent approval snapshot -- see
-- remove_material_photo() below.
DROP POLICY IF EXISTS order_materials_photos_owner_manager_delete ON storage.objects;
CREATE POLICY order_materials_photos_owner_manager_delete
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'order-materials'
    AND has_store_role((split_part(name, '/', 1))::uuid, ARRAY['owner'::store_role, 'manager'::store_role])
  );

-- 3. Keep the legacy photo_url in sync with photo_urls[1] (or null), and
--    default received_by/received_at on insert -- covers every insert path
--    (order-form, offline sync, any future one) rather than relying on the
--    app to set them consistently.
CREATE OR REPLACE FUNCTION public.sync_material_photo_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.photo_url := NEW.photo_urls[1];
  IF TG_OP = 'INSERT' THEN
    IF NEW.source = 'customer' AND NEW.received_by IS NULL THEN
      NEW.received_by := auth.uid();
    END IF;
    IF NEW.received_at IS NULL THEN
      NEW.received_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sync_material_photo_fields() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sync_material_photo_fields_trigger ON public.order_materials;
CREATE TRIGGER sync_material_photo_fields_trigger
BEFORE INSERT OR UPDATE ON public.order_materials
FOR EACH ROW EXECUTE FUNCTION public.sync_material_photo_fields();

-- 4. Only owner/manager may shrink photo_urls (i.e. remove a photo),
--    enforced at the table level regardless of which path is used to
--    attempt it -- RLS is row-level, not column-level, so the table's
--    existing member-wide UPDATE policy (needed so any member can add a
--    photo) can't express this distinction on its own.
CREATE OR REPLACE FUNCTION public.enforce_material_photo_removal_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.photo_urls IS DISTINCT FROM NEW.photo_urls
     AND coalesce(array_length(NEW.photo_urls, 1), 0) < coalesce(array_length(OLD.photo_urls, 1), 0)
     AND NOT public.has_store_role(NEW.store_id, ARRAY['owner'::store_role, 'manager'::store_role])
  THEN
    RAISE EXCEPTION 'Only the owner or a manager can remove fabric photos' USING ERRCODE = 'P0108';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.enforce_material_photo_removal_role() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_material_photo_removal_role_trigger ON public.order_materials;
CREATE TRIGGER enforce_material_photo_removal_role_trigger
BEFORE UPDATE ON public.order_materials
FOR EACH ROW EXECUTE FUNCTION public.enforce_material_photo_removal_role();

-- 5. The app's own removal path: owner/manager only (also enforced by the
--    trigger above, as a backstop). Evidence protection -- if the path is
--    referenced in ANY sent approval snapshot for this order (any status:
--    once sent, it's evidence), only the array entry is removed and the
--    storage object is kept. Otherwise the now-unused object is deleted.
CREATE OR REPLACE FUNCTION public.remove_material_photo(p_material_id uuid, p_path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_material public.order_materials%ROWTYPE;
  v_referenced boolean;
BEGIN
  SELECT * INTO v_material FROM public.order_materials WHERE id = p_material_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Material not found' USING ERRCODE = 'P0102';
  END IF;
  IF NOT public.has_store_role(v_material.store_id, ARRAY['owner'::store_role, 'manager'::store_role]) THEN
    RAISE EXCEPTION 'Only the owner or a manager can remove fabric photos' USING ERRCODE = 'P0108';
  END IF;

  UPDATE public.order_materials
  SET photo_urls = array_remove(photo_urls, p_path)
  WHERE id = p_material_id;

  SELECT EXISTS (
    SELECT 1 FROM public.order_approvals oa,
      jsonb_array_elements(coalesce(oa.snapshot -> 'materials', '[]'::jsonb)) AS mat
    WHERE oa.order_id = v_material.order_id
      AND coalesce(mat -> 'photo_urls', '[]'::jsonb) ? p_path
  ) INTO v_referenced;

  IF NOT v_referenced THEN
    DELETE FROM storage.objects WHERE bucket_id = 'order-materials' AND name = p_path;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.remove_material_photo(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_material_photo(uuid, text) TO authenticated;

-- 6. create_order_approval_request -- same as Step 3.2, plus photo_urls and
--    extras_received in each material's snapshot entry. Nothing else here
--    changes.
CREATE OR REPLACE FUNCTION public.create_order_approval_request(p_order_id uuid)
RETURNS public.order_approvals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_materials jsonb;
  v_measurements jsonb;
  v_paid numeric;
  v_row public.order_approvals%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0102';
  END IF;
  IF NOT public.is_store_member(v_order.store_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'description', m.description,
    'colour', m.colour,
    'yards', m.yards,
    'cost', m.cost,
    'cost_per_yard', m.cost_per_yard,
    'source', m.source,
    'photo_url', m.photo_url,
    'photo_urls', to_jsonb(m.photo_urls),
    'extras_received', m.extras_received
  )), '[]'::jsonb) INTO v_materials
  FROM public.order_materials m
  WHERE m.order_id = p_order_id;

  IF v_order.measurement_set_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'values', ms.values,
      'extra_fields', ms.extra_fields,
      'unit', ms.unit,
      'taken_at', ms.taken_at
    ) INTO v_measurements
    FROM public.measurement_sets ms
    WHERE ms.id = v_order.measurement_set_id;
  END IF;

  SELECT paid INTO v_paid FROM public.order_balances WHERE order_id = p_order_id;

  INSERT INTO public.order_approvals (order_id, store_id, snapshot)
  VALUES (
    p_order_id,
    v_order.store_id,
    jsonb_build_object(
      'garment_type', v_order.garment_type,
      'quantity', v_order.quantity,
      'materials', v_materials,
      'style_reference_photos', to_jsonb(coalesce(v_order.style_reference_photos, ARRAY[]::text[])),
      'style_notes', v_order.style_notes,
      'measurements', v_measurements,
      'price', v_order.price,
      'amount_paid', coalesce(v_paid, 0),
      'delivery_date', v_order.delivery_date
    )
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_order_approval_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order_approval_request(uuid) TO authenticated;

-- 7. order_materials_for_tailor is the same column-allowlist-view pattern as
--    orders_for_tailor -- a plain SELECT with no filtering logic of its own
--    (row visibility still comes from order_materials' own RLS), just
--    without cost/cost_per_yard, so a tailor role can read the fabric-intake
--    record without the app ever receiving its cost fields over the wire.
CREATE OR REPLACE VIEW public.order_materials_for_tailor AS
SELECT
  id, order_id, store_id, source, description, colour, yards,
  photo_url, photo_urls, extras_received, received_by, received_at,
  purchased_at, created_at
FROM public.order_materials;

-- 8. Verification -- one row, every object this script is responsible for.
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_materials' AND column_name = 'photo_urls'
  ) AS order_materials_photo_urls,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_materials' AND column_name = 'received_by'
  ) AS order_materials_received_by,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_materials' AND column_name = 'received_at'
  ) AS order_materials_received_at,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_materials' AND column_name = 'extras_received'
  ) AS order_materials_extras_received,
  EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_materials_photo_urls_max6'
  ) AS photo_urls_max6_check,
  (
    SELECT NOT b.public FROM storage.buckets b WHERE b.id = 'order-materials'
  ) AS order_materials_bucket_private,
  (
    SELECT count(*) = 3 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname IN (
        'order_materials_photos_member_read',
        'order_materials_photos_member_insert',
        'order_materials_photos_owner_manager_delete'
      )
  ) AS storage_policies_present,
  (to_regprocedure('public.remove_material_photo(uuid,text)') IS NOT NULL) AS remove_material_photo_fn,
  (to_regprocedure('public.sync_material_photo_fields()') IS NOT NULL) AS sync_material_photo_fields_fn,
  (to_regprocedure('public.enforce_material_photo_removal_role()') IS NOT NULL) AS enforce_material_photo_removal_role_fn,
  EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'order_materials_for_tailor'
  ) AS order_materials_for_tailor_view,
  NOT EXISTS (
    SELECT 1 FROM public.order_materials
    WHERE photo_url IS NOT NULL AND (photo_urls IS NULL OR array_length(photo_urls, 1) IS NULL)
  ) AS backfill_complete;

COMMIT;
