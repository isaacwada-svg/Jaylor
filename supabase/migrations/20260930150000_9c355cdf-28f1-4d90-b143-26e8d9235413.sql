-- PR G: materials inventory (Business and Custom plans).
--
-- Tracks stock in/used per order, warns when items run low, and feeds
-- material costs into order profit via the existing order_materials/
-- staff_earnings-style flow. Safe to run more than once.

BEGIN;

-- 1. Gate: a boolean "inventory" key on plans.limits, same pattern as
--    "payroll" in Step 3.6 -- read through feature_usage(), so the
--    trial-period rule already coded there applies automatically.
UPDATE public.plans SET limits = limits || jsonb_build_object('inventory', true)
WHERE code IN ('business', 'custom');
UPDATE public.plans SET limits = limits || jsonb_build_object('inventory', false)
WHERE code IN ('free', 'growth');

-- 2. Items. Quantity/cost_per_unit are never written directly (see the
--    functions below) -- name/category/unit/reorder_level/is_active go
--    through create_inventory_item()/update_inventory_item() too, so no
--    role can reach quantity or cost_per_unit through a plain table write.
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id),
  name text NOT NULL,
  category text NOT NULL CHECK (category IN
    ('lining', 'zip', 'thread', 'button', 'interfacing', 'stone', 'lace', 'fabric', 'other')),
  unit text NOT NULL CHECK (unit IN ('yard', 'metre', 'piece', 'roll', 'pack', 'spool')),
  quantity numeric NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  reorder_level numeric NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  cost_per_unit numeric CHECK (cost_per_unit IS NULL OR cost_per_unit >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_items_store_name_unique
  ON public.inventory_items (store_id, lower(name));
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_items_member_select ON public.inventory_items;
CREATE POLICY inventory_items_member_select ON public.inventory_items FOR SELECT TO authenticated
  USING (public.is_store_member(store_id));
-- No direct INSERT/UPDATE/DELETE policy -- functions only.

-- Column-allowlist view (same pattern as orders_for_tailor/
-- order_materials_for_tailor) so a tailor's browser never receives
-- cost_per_unit over the wire.
CREATE OR REPLACE VIEW public.inventory_items_for_tailor AS
SELECT id, store_id, name, category, unit, quantity, reorder_level, is_active,
       created_by, created_at, updated_at
FROM public.inventory_items;

-- 3. Movements. quantity is always positive except for 'adjust', which
--    stores the signed change -- so no CHECK forces positivity here.
--    Owner/manager only: tailors never need to read a movement directly
--    (only trigger one, via use_stock_on_order()), and unit_cost is
--    sensitive in the same way cost_per_unit is.
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id),
  item_id uuid NOT NULL REFERENCES public.inventory_items(id),
  type text NOT NULL CHECK (type IN ('in', 'used', 'adjust', 'return')),
  quantity numeric NOT NULL,
  unit_cost numeric,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  order_material_id uuid REFERENCES public.order_materials(id) ON DELETE SET NULL,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_movements_owner_manager_select ON public.inventory_movements;
CREATE POLICY inventory_movements_owner_manager_select ON public.inventory_movements FOR SELECT TO authenticated
  USING (public.has_store_role(store_id, ARRAY['owner'::store_role, 'manager'::store_role]));
-- No direct mutation policy -- functions only.

-- 4. order_materials -- a material row knows it came from stock. Nullable,
--    no change to any existing row.
ALTER TABLE public.order_materials ADD COLUMN IF NOT EXISTS inventory_item_id uuid
  REFERENCES public.inventory_items(id);

-- 5. Private helper (no grants -- reachable only from the SECURITY DEFINER
--    functions below, same pattern as PR C/D/F's private helpers). Called
--    by every inventory-mutating function, including use_stock_on_order()
--    which any store member (a tailor included) can otherwise call.
CREATE OR REPLACE FUNCTION public._require_inventory_feature(p_store_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed boolean;
BEGIN
  SELECT (public.feature_usage(p_store_id, 'inventory') ->> 'allowed')::boolean INTO v_allowed;
  IF NOT coalesce(v_allowed, false) THEN
    RAISE EXCEPTION 'Inventory requires the Business plan' USING ERRCODE = 'P0115';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._require_inventory_feature(uuid) FROM PUBLIC, anon, authenticated;

-- 6. Owner/manager: create an item.
CREATE OR REPLACE FUNCTION public.create_inventory_item(
  p_store_id uuid, p_name text, p_category text, p_unit text,
  p_reorder_level numeric DEFAULT 0, p_initial_quantity numeric DEFAULT 0,
  p_cost_per_unit numeric DEFAULT NULL
)
RETURNS public.inventory_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.inventory_items%ROWTYPE;
BEGIN
  IF NOT public.has_store_role(p_store_id, ARRAY['owner'::store_role, 'manager'::store_role]) THEN
    RAISE EXCEPTION 'Only the owner or a manager can add inventory items' USING ERRCODE = 'P0108';
  END IF;
  PERFORM public._require_inventory_feature(p_store_id);
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Name is required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.inventory_items
    (store_id, name, category, unit, reorder_level, quantity, cost_per_unit, created_by)
  VALUES (
    p_store_id, trim(p_name), p_category, p_unit,
    coalesce(p_reorder_level, 0), coalesce(p_initial_quantity, 0), p_cost_per_unit, auth.uid()
  )
  RETURNING * INTO v_row;

  IF v_row.quantity > 0 THEN
    INSERT INTO public.inventory_movements (store_id, item_id, type, quantity, unit_cost, note, created_by)
    VALUES (p_store_id, v_row.id, 'in', v_row.quantity, p_cost_per_unit, 'Initial stock', auth.uid());
  END IF;

  RETURN v_row;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_inventory_item(uuid, text, text, text, numeric, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_inventory_item(uuid, text, text, text, numeric, numeric, numeric) TO authenticated;

-- 7. Owner/manager: edit metadata only -- quantity and cost_per_unit are
--    untouched here, they only ever change via the stock functions below.
CREATE OR REPLACE FUNCTION public.update_inventory_item(
  p_item_id uuid, p_name text DEFAULT NULL, p_category text DEFAULT NULL,
  p_unit text DEFAULT NULL, p_reorder_level numeric DEFAULT NULL, p_is_active boolean DEFAULT NULL
)
RETURNS public.inventory_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.inventory_items%ROWTYPE;
BEGIN
  SELECT * INTO v_item FROM public.inventory_items WHERE id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found' USING ERRCODE = 'P0102';
  END IF;
  IF NOT public.has_store_role(v_item.store_id, ARRAY['owner'::store_role, 'manager'::store_role]) THEN
    RAISE EXCEPTION 'Only the owner or a manager can edit inventory items' USING ERRCODE = 'P0108';
  END IF;
  PERFORM public._require_inventory_feature(v_item.store_id);

  UPDATE public.inventory_items
  SET name = coalesce(nullif(trim(p_name), ''), name),
      category = coalesce(p_category, category),
      unit = coalesce(p_unit, unit),
      reorder_level = coalesce(p_reorder_level, reorder_level),
      is_active = coalesce(p_is_active, is_active),
      updated_at = now()
  WHERE id = p_item_id
  RETURNING * INTO v_item;

  RETURN v_item;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.update_inventory_item(uuid, text, text, text, numeric, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_inventory_item(uuid, text, text, text, numeric, boolean) TO authenticated;

-- 8. Owner/manager: stock in. cost_per_unit becomes a weighted average of
--    the existing stock and this batch, so a rise or fall in supplier
--    price is smoothed rather than overwriting history.
CREATE OR REPLACE FUNCTION public.record_stock_in(
  p_item_id uuid, p_quantity numeric, p_unit_cost numeric DEFAULT NULL, p_note text DEFAULT NULL
)
RETURNS public.inventory_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.inventory_items%ROWTYPE;
  v_new_quantity numeric;
  v_new_cost numeric;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_item FROM public.inventory_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found' USING ERRCODE = 'P0102';
  END IF;
  IF NOT public.has_store_role(v_item.store_id, ARRAY['owner'::store_role, 'manager'::store_role]) THEN
    RAISE EXCEPTION 'Only the owner or a manager can record stock' USING ERRCODE = 'P0108';
  END IF;
  PERFORM public._require_inventory_feature(v_item.store_id);

  v_new_quantity := v_item.quantity + p_quantity;
  v_new_cost := CASE
    WHEN p_unit_cost IS NULL THEN v_item.cost_per_unit
    WHEN v_new_quantity = 0 THEN p_unit_cost
    ELSE (v_item.quantity * coalesce(v_item.cost_per_unit, 0) + p_quantity * p_unit_cost) / v_new_quantity
  END;

  UPDATE public.inventory_items
  SET quantity = v_new_quantity, cost_per_unit = v_new_cost, updated_at = now()
  WHERE id = p_item_id
  RETURNING * INTO v_item;

  INSERT INTO public.inventory_movements (store_id, item_id, type, quantity, unit_cost, note, created_by)
  VALUES (v_item.store_id, p_item_id, 'in', p_quantity, p_unit_cost, nullif(trim(coalesce(p_note, '')), ''), auth.uid());

  RETURN v_item;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.record_stock_in(uuid, numeric, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_stock_in(uuid, numeric, numeric, text) TO authenticated;

-- 9. Any store member: use stock on an order. Locks the item row (FOR
--    UPDATE) so two simultaneous uses can't both pass the availability
--    check. Creates a real order_materials row (source 'tailor', i.e. the
--    existing "I will buy the fabric" branch) so the cost flows into the
--    order's existing profit calculation with no further wiring.
CREATE OR REPLACE FUNCTION public.use_stock_on_order(
  p_item_id uuid, p_order_id uuid, p_quantity numeric, p_note text DEFAULT NULL
)
RETURNS public.order_materials
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.inventory_items%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_material public.order_materials%ROWTYPE;
  v_cost numeric;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0102';
  END IF;
  IF NOT public.is_store_member(v_order.store_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  PERFORM public._require_inventory_feature(v_order.store_id);

  SELECT * INTO v_item FROM public.inventory_items
  WHERE id = p_item_id AND store_id = v_order.store_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found' USING ERRCODE = 'P0102';
  END IF;
  IF NOT v_item.is_active THEN
    RAISE EXCEPTION 'This item is no longer active' USING ERRCODE = 'P0113';
  END IF;
  IF v_item.quantity < p_quantity THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0114',
      MESSAGE = format('Only %s %s%s of this %s left',
        v_item.quantity, v_item.unit, CASE WHEN v_item.quantity = 1 THEN '' ELSE 's' END, v_item.name);
  END IF;

  v_cost := p_quantity * coalesce(v_item.cost_per_unit, 0);

  UPDATE public.inventory_items
  SET quantity = quantity - p_quantity, updated_at = now()
  WHERE id = p_item_id;

  INSERT INTO public.order_materials
    (store_id, order_id, source, description, colour, yards, cost, cost_per_yard, inventory_item_id)
  VALUES (
    v_order.store_id, p_order_id, 'tailor', v_item.name, NULL,
    CASE WHEN v_item.unit = 'yard' THEN p_quantity ELSE NULL END,
    v_cost, v_item.cost_per_unit, p_item_id
  )
  RETURNING * INTO v_material;

  INSERT INTO public.inventory_movements
    (store_id, item_id, type, quantity, unit_cost, order_id, order_material_id, note, created_by)
  VALUES (
    v_order.store_id, p_item_id, 'used', p_quantity, v_item.cost_per_unit,
    p_order_id, v_material.id, nullif(trim(coalesce(p_note, '')), ''), auth.uid()
  );

  RETURN v_material;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.use_stock_on_order(uuid, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.use_stock_on_order(uuid, uuid, numeric, text) TO authenticated;

-- 10. Owner/manager only: the sole way to correct a count, including down
--     to zero. Records the signed difference (positive or negative).
CREATE OR REPLACE FUNCTION public.adjust_stock(p_item_id uuid, p_new_quantity numeric, p_reason text)
RETURNS public.inventory_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.inventory_items%ROWTYPE;
  v_diff numeric;
BEGIN
  IF p_new_quantity IS NULL OR p_new_quantity < 0 THEN
    RAISE EXCEPTION 'Quantity cannot be negative' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'A reason is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_item FROM public.inventory_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found' USING ERRCODE = 'P0102';
  END IF;
  IF NOT public.has_store_role(v_item.store_id, ARRAY['owner'::store_role, 'manager'::store_role]) THEN
    RAISE EXCEPTION 'Only the owner or a manager can adjust stock' USING ERRCODE = 'P0108';
  END IF;
  PERFORM public._require_inventory_feature(v_item.store_id);

  v_diff := p_new_quantity - v_item.quantity;

  UPDATE public.inventory_items
  SET quantity = p_new_quantity, updated_at = now()
  WHERE id = p_item_id
  RETURNING * INTO v_item;

  INSERT INTO public.inventory_movements (store_id, item_id, type, quantity, note, created_by)
  VALUES (v_item.store_id, p_item_id, 'adjust', v_diff, trim(p_reason), auth.uid());

  RETURN v_item;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.adjust_stock(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_stock(uuid, numeric, text) TO authenticated;

-- 11. If a material row that came from stock is deleted -- directly, or
--     because its order was deleted and the FK cascades -- return the
--     quantity to stock. Reads the original 'used' movement rather than
--     order_materials.yards, since yards is only ever populated when the
--     item's unit is 'yard'; this way it works for every unit. BEFORE
--     DELETE (not AFTER): inventory_movements.order_material_id is
--     ON DELETE SET NULL, and that action fires as part of removing this
--     row, so an AFTER trigger could race it and find the link already
--     cleared. Firing before guarantees the lookup below still sees it.
CREATE OR REPLACE FUNCTION public.return_stock_on_material_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quantity numeric;
  v_unit_cost numeric;
  v_order_exists boolean;
BEGIN
  IF OLD.inventory_item_id IS NULL THEN
    RETURN OLD;
  END IF;

  SELECT im.quantity, im.unit_cost INTO v_quantity, v_unit_cost
  FROM public.inventory_movements im
  WHERE im.order_material_id = OLD.id AND im.type = 'used'
  ORDER BY im.created_at DESC
  LIMIT 1;

  IF v_quantity IS NULL THEN
    RETURN OLD;
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.orders WHERE id = OLD.order_id) INTO v_order_exists;

  UPDATE public.inventory_items
  SET quantity = quantity + v_quantity, updated_at = now()
  WHERE id = OLD.inventory_item_id;

  INSERT INTO public.inventory_movements
    (store_id, item_id, type, quantity, unit_cost, order_id, order_material_id, note, created_by)
  VALUES (
    OLD.store_id, OLD.inventory_item_id, 'return', v_quantity, v_unit_cost,
    CASE WHEN v_order_exists THEN OLD.order_id ELSE NULL END, OLD.id,
    CASE WHEN v_order_exists THEN 'material removed' ELSE 'order deleted' END,
    auth.uid()
  );

  RETURN OLD;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.return_stock_on_material_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS return_stock_on_material_delete_trigger ON public.order_materials;
CREATE TRIGGER return_stock_on_material_delete_trigger
BEFORE DELETE ON public.order_materials
FOR EACH ROW EXECUTE FUNCTION public.return_stock_on_material_delete();

-- 12. get_daily_digest_data() -- reproduced from its tracked definition
--     (20260928152146), every existing field unchanged, with low_stock_items
--     added.
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

  SELECT coalesce(sum(balance), 0) INTO v_outstanding
  FROM public.order_balances WHERE store_id = p_store_id;

  SELECT coalesce(jsonb_agg(t), '[]'::jsonb) INTO v_top3
  FROM (
    SELECT c.full_name AS client_name, b.balance, o.number
    FROM public.order_balances b
    JOIN public.orders o ON o.id = b.order_id
    JOIN public.clients c ON c.id = o.client_id
    WHERE b.store_id = p_store_id AND b.balance > 0
    ORDER BY b.balance DESC
    LIMIT 3
  ) t;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id, 'name', i.name, 'quantity', i.quantity, 'unit', i.unit
  ) ORDER BY i.name), '[]'::jsonb) INTO v_low_stock
  FROM public.inventory_items i
  WHERE i.store_id = p_store_id AND i.is_active AND i.reorder_level > 0 AND i.quantity <= i.reorder_level;

  RETURN jsonb_build_object(
    'due_today', v_due_today,
    'due_next_3_days', v_due_next3,
    'overdue', v_overdue,
    'outstanding_total', v_outstanding,
    'top_balances', v_top3,
    'low_stock_items', v_low_stock
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_daily_digest_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_daily_digest_data(uuid) TO authenticated, service_role;

-- 13. Verification -- one row: all_true, and which checks (if any) failed.
SELECT
  bool_and(v) AS all_true,
  coalesce(string_agg(k, ', ') FILTER (WHERE NOT v), 'none') AS failed_checks
FROM (VALUES
  ('plans_inventory_key', coalesce((
    SELECT bool_and(limits ? 'inventory') FROM public.plans
    WHERE code IN ('free', 'growth', 'business', 'custom')
  ), false)),
  ('plans_inventory_business_custom_true', coalesce((
    SELECT bool_and((limits ->> 'inventory')::boolean) FROM public.plans WHERE code IN ('business', 'custom')
  ), false)),
  ('plans_inventory_free_growth_false', coalesce((
    SELECT bool_and(NOT (limits ->> 'inventory')::boolean) FROM public.plans WHERE code IN ('free', 'growth')
  ), false)),
  ('inventory_items_table', to_regclass('public.inventory_items') IS NOT NULL),
  ('inventory_movements_table', to_regclass('public.inventory_movements') IS NOT NULL),
  ('order_materials_inventory_item_id', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_materials' AND column_name = 'inventory_item_id'
  )),
  ('inventory_items_for_tailor_view', EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'inventory_items_for_tailor'
  )),
  ('create_inventory_item_fn', to_regprocedure('public.create_inventory_item(uuid,text,text,text,numeric,numeric,numeric)') IS NOT NULL),
  ('update_inventory_item_fn', to_regprocedure('public.update_inventory_item(uuid,text,text,text,numeric,boolean)') IS NOT NULL),
  ('record_stock_in_fn', to_regprocedure('public.record_stock_in(uuid,numeric,numeric,text)') IS NOT NULL),
  ('use_stock_on_order_fn', to_regprocedure('public.use_stock_on_order(uuid,uuid,numeric,text)') IS NOT NULL),
  ('adjust_stock_fn', to_regprocedure('public.adjust_stock(uuid,numeric,text)') IS NOT NULL),
  ('return_stock_trigger', EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'return_stock_on_material_delete_trigger'
  )),
  ('get_daily_digest_data_fn', to_regprocedure('public.get_daily_digest_data(uuid)') IS NOT NULL),
  ('inventory_items_rls_enabled', coalesce((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.inventory_items'::regclass), false)),
  ('inventory_movements_rls_enabled', coalesce((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.inventory_movements'::regclass), false))
) AS checks(k, v);

COMMIT;
