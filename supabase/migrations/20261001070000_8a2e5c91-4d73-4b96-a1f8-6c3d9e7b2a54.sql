-- PR P continued: currency on the public tracking/approval pages, and a
-- second instance of the same service-role/auth.uid() bug found while
-- building this -- get_order_tracking() (the public /t/$token page) reads
-- public.order_balances directly, whose WHERE clause is
-- has_store_role(store_id, ...), which reads auth.uid(). An anonymous
-- public page request has no auth.uid(), so this has always silently
-- returned zero rows here too: every /t/$token page has shown "paid: 0,
-- balance: 0" regardless of the order's real figures. Fixed the same way
-- as the digest functions -- reading through private _all_order_balances()
-- (added in the previous migration) instead of the role-gated view.
--
-- Also: Jaylor Pay is NGN-only (Paystack NG dedicated accounts and
-- payment links are NGN-denominated), so jaylor_pay_available is now
-- false outright for a non-NGN order, and create_order_approval_request's
-- frozen snapshot now carries the order's currency/fx_rate_to_ngn so the
-- approval page can show the right symbol.
--
-- Safe to run more than once.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_order_tracking(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_store record;
  v_balance record;
  v_dedicated record;
  v_jaylor_pay boolean;
  v_timeline jsonb;
  v_next_fitting record;
  v_client_language text;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE tracking_token = p_token;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT name, logo_url, language INTO v_store FROM public.stores WHERE id = v_order.store_id;
  SELECT preferred_language INTO v_client_language FROM public.clients WHERE id = v_order.client_id;

  SELECT paid, balance INTO v_balance
  FROM public._all_order_balances() WHERE order_id = v_order.id;

  SELECT account_number, account_name, bank_name INTO v_dedicated
  FROM public.dedicated_accounts
  WHERE store_id = v_order.store_id AND status = 'active';

  SELECT (v_order.currency = 'NGN') AND EXISTS (
    SELECT 1 FROM public.payment_accounts
    WHERE store_id = v_order.store_id AND status = 'active' AND subaccount_code IS NOT NULL
  ) INTO v_jaylor_pay;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'from_status', h.from_status,
    'to_status', h.to_status,
    'changed_at', h.changed_at,
    'note', h.note,
    'photo_url', h.photo_url
  ) ORDER BY h.changed_at ASC), '[]'::jsonb) INTO v_timeline
  FROM public.order_status_history h
  WHERE h.order_id = v_order.id;

  SELECT starts_at, purpose INTO v_next_fitting
  FROM public.consultations
  WHERE order_id = v_order.id AND status <> 'cancelled' AND starts_at > now()
  ORDER BY starts_at ASC
  LIMIT 1;

  RETURN jsonb_build_object(
    'store_name', coalesce(v_store.name, 'Jaylor'),
    'store_logo_url', v_store.logo_url,
    'store_language', v_store.language,
    'client_preferred_language', v_client_language,
    'garment_type', v_order.garment_type,
    'quantity', v_order.quantity,
    'status', v_order.status,
    'delivery_date', v_order.delivery_date,
    'ready_at', v_order.ready_at,
    'currency', v_order.currency,
    'paid', coalesce(v_balance.paid, 0),
    'balance', coalesce(v_balance.balance, 0),
    'order_id', v_order.id,
    'timeline', v_timeline,
    'dedicated_account', CASE WHEN v_dedicated.account_number IS NOT NULL THEN
      jsonb_build_object(
        'account_number', v_dedicated.account_number,
        'account_name', v_dedicated.account_name,
        'bank_name', v_dedicated.bank_name
      )
    ELSE NULL END,
    'jaylor_pay_available', coalesce(v_jaylor_pay, false),
    'next_fitting', CASE WHEN v_next_fitting.starts_at IS NOT NULL THEN
      jsonb_build_object('starts_at', v_next_fitting.starts_at, 'purpose', v_next_fitting.purpose)
    ELSE NULL END
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_order_tracking(uuid) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.get_order_tracking(uuid) TO anon, authenticated;

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

  -- Reads the private, ungranted helper instead of the public
  -- order_balances view: that view's own WHERE clause is
  -- has_store_role(store_id, ARRAY['owner','manager']), but this function
  -- itself only requires is_store_member() (any role, including tailor),
  -- so a tailor-initiated approval request would otherwise always see
  -- amount_paid = 0 regardless of the order's real payments.
  SELECT paid INTO v_paid FROM public._all_order_balances() WHERE order_id = p_order_id;

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
      'currency', v_order.currency,
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

COMMIT;

-- Verification: expect every row true, failed_checks empty.
SELECT
  bool_and(ok) AS all_true,
  coalesce(array_agg(check_name) FILTER (WHERE NOT ok), ARRAY[]::text[]) AS failed_checks
FROM (
  SELECT 'get_order_tracking returns currency' AS check_name,
    (pg_get_functiondef('public.get_order_tracking(uuid)'::regprocedure) ILIKE '%''currency''%') AS ok
  UNION ALL
  SELECT 'get_order_tracking reads _all_order_balances not the view',
    (pg_get_functiondef('public.get_order_tracking(uuid)'::regprocedure) ILIKE '%_all_order_balances%')
  UNION ALL
  SELECT 'create_order_approval_request carries currency',
    (pg_get_functiondef('public.create_order_approval_request(uuid)'::regprocedure) ILIKE '%''currency''%')
) checks;
