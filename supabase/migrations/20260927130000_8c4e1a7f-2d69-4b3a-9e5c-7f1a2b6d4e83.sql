-- Profit per order: labour and other (non-material) costs, on top of the
-- existing order_materials.cost, so the order page and Reports can show
-- price, cost, profit and margin per order.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS labour_cost numeric CHECK (labour_cost IS NULL OR labour_cost >= 0),
  ADD COLUMN IF NOT EXISTS other_cost numeric CHECK (other_cost IS NULL OR other_cost >= 0);
