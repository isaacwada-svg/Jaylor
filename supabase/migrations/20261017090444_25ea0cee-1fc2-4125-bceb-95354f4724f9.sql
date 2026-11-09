-- get_daily_digest_data's other_currencies block nested sum(b.balance)
-- directly inside jsonb_agg(jsonb_build_object(...)) -- Postgres rejects
-- two aggregates in the same scope ("aggregate function calls cannot be
-- nested"), which only surfaces at call time since plpgsql bodies aren't
-- type-checked at CREATE time. get_weekly_digest_data (same migration,
-- 20261001060000) already does this correctly via a pre-aggregated
-- subquery; this applies the same fix to the daily function, with every
-- other field unchanged from 20261001060000.
CREATE OR REPLACE FUNCTION public.get_daily_digest_data(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_due_today jsonb;
  v_due_next3 jsonb;
  v_overdue jsonb;
  v_outstanding numeric;
  v_top3 jsonb;
  v_low_stock jsonb;
  v_other_currencies jsonb;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.has_store_role(p_store_id, ARRAY['owner'::store_role, 'manager'::store_role]) THEN
    RAISE EXCEPTION 'You do not have permission to do this' USING ERRCODE = 'P0103';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'order_id', o.id, 'number', o.number, 'garment_type', o.garment_type, 'client_name', c.full_name
  )), '[]'::jsonb) INTO v_due_today
  FROM public.orders o JOIN public.clients c ON c.id = o.client_id
  WHERE o.store_id = p_store_id AND o.status NOT IN ('collected', 'cancelled')
    AND o.delivery_date::date = current_date;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'order_id', o.id, 'number', o.number, 'garment_type', o.garment_type, 'client_name', c.full_name,
    'delivery_date', o.delivery_date
  )), '[]'::jsonb) INTO v_due_next3
  FROM public.orders o JOIN public.clients c ON c.id = o.client_id
  WHERE o.store_id = p_store_id AND o.status NOT IN ('collected', 'cancelled')
    AND o.delivery_date::date BETWEEN current_date + 1 AND current_date + 3;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'order_id', o.id, 'number', o.number, 'garment_type', o.garment_type, 'client_name', c.full_name,
    'delivery_date', o.delivery_date
  )), '[]'::jsonb) INTO v_overdue
  FROM public.orders o JOIN public.clients c ON c.id = o.client_id
  WHERE o.store_id = p_store_id AND o.status NOT IN ('collected', 'cancelled')
    AND o.delivery_date::date < current_date;

  SELECT coalesce(sum(b.balance), 0) INTO v_outstanding
  FROM public._store_order_balances(p_store_id) b WHERE b.currency = 'NGN';

  SELECT coalesce(jsonb_agg(t), '[]'::jsonb) INTO v_top3
  FROM (
    SELECT c.full_name AS client_name, b.balance, o.number
    FROM public._store_order_balances(p_store_id) b
    JOIN public.orders o ON o.id = b.order_id
    JOIN public.clients c ON c.id = o.client_id
    WHERE b.currency = 'NGN' AND b.balance > 0
    ORDER BY b.balance DESC
    LIMIT 3
  ) t;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id, 'name', i.name, 'quantity', i.quantity, 'unit', i.unit
  ) ORDER BY i.name), '[]'::jsonb) INTO v_low_stock
  FROM public.inventory_items i
  WHERE i.store_id = p_store_id AND i.is_active AND i.reorder_level > 0 AND i.quantity <= i.reorder_level;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'currency', x.currency, 'outstanding', x.outstanding
  )), '[]'::jsonb) INTO v_other_currencies
  FROM (
    SELECT b.currency, sum(b.balance) AS outstanding
    FROM public._store_order_balances(p_store_id) b
    WHERE b.currency <> 'NGN'
    GROUP BY b.currency
  ) x;

  RETURN jsonb_build_object(
    'due_today', v_due_today,
    'due_next_3_days', v_due_next3,
    'overdue', v_overdue,
    'outstanding_total', v_outstanding,
    'top_balances', v_top3,
    'low_stock_items', v_low_stock,
    'other_currencies', v_other_currencies
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_daily_digest_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_daily_digest_data(uuid) TO authenticated, service_role;
