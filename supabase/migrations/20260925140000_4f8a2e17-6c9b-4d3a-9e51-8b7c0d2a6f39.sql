-- orders_for_tailor is a plain column-allowlist view over orders (no filtering
-- logic of its own -- access control comes from orders' own RLS), confirmed via:
--   SELECT pg_get_viewdef('public.orders_for_tailor'::regclass, true);
-- Recreated with the same column list plus style_reference_photos, so tailors
-- (who read orders through this view rather than the base table) can see the
-- reference photos added for the fabric-step upload feature.
CREATE OR REPLACE VIEW public.orders_for_tailor AS
SELECT
  id, store_id, number, client_id, garment_type, style_notes,
  measurement_set_id, quantity, delivery_date, status, priority,
  assigned_to, ready_at, collected_at, created_by, created_at, updated_at,
  style_reference_photos
FROM public.orders;
