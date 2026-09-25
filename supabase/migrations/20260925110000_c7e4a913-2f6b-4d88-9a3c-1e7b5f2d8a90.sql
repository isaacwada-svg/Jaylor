-- Private bucket for reference-style photos attached to an order at creation
-- time (customer's preferred style). Members-only, scoped per store folder --
-- same posture as the existing ai-design-photos bucket.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'order-style-photos',
  'order-style-photos',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY order_style_photos_member_read
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'order-style-photos'
    AND is_store_member((split_part(name, '/', 1))::uuid)
  );

CREATE POLICY order_style_photos_member_insert
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'order-style-photos'
    AND is_store_member((split_part(name, '/', 1))::uuid)
  );

ALTER TABLE public.orders
  ADD COLUMN style_reference_photos text[];
