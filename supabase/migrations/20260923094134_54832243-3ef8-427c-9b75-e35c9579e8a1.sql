-- Fit-check guest page support: a minimal, safe read of what the page
-- needs to render (garment name, client's first name, shop name, whether
-- feedback was already given), matching the same unguessable order_id +
-- client_id pairing record_fit_feedback() already verifies.
CREATE OR REPLACE FUNCTION public.get_fitcheck_context(p_order_id uuid, p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_garment_type text;
  v_client_name text;
  v_store_name text;
  v_already boolean;
BEGIN
  SELECT o.garment_type, c.full_name, s.name
    INTO v_garment_type, v_client_name, v_store_name
  FROM public.orders o
  JOIN public.clients c ON c.id = o.client_id
  JOIN public.stores s ON s.id = o.store_id
  WHERE o.id = p_order_id AND o.client_id = p_client_id;

  IF v_garment_type IS NULL THEN
    RAISE EXCEPTION 'Not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.client_fit_feedback
    WHERE order_id = p_order_id AND client_id = p_client_id
  ) INTO v_already;

  RETURN jsonb_build_object(
    'garment_type', v_garment_type,
    'client_first_name', split_part(v_client_name, ' ', 1),
    'store_name', v_store_name,
    'already_submitted', v_already
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_fitcheck_context(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_fitcheck_context(uuid, uuid) TO anon, authenticated;
