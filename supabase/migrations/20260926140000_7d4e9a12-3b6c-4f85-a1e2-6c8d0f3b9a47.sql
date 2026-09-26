-- Quotations: a standalone quote for a customer (discount + how long it
-- stays), separate from the existing events/contracts "quote" stage (which
-- is specifically for single-payer group jobs like school uniforms).
-- Downloadable as a branded PDF (reuses the app's existing print-to-PDF
-- convention), shareable on WhatsApp via a public tokenized link (mirrors
-- the e.$token contract-acceptance flow), and convertible to a real order
-- in one tap.

CREATE TABLE public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  quote_number text,
  garment_type text NOT NULL,
  garment_type_code text,
  quantity int NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price numeric NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  discount_percent numeric NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  notes text,
  valid_until timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'expired', 'converted')),
  quote_token uuid NOT NULL DEFAULT gen_random_uuid(),
  converted_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX quotes_quote_token_key ON public.quotes (quote_token);
CREATE INDEX quotes_store_id_idx ON public.quotes (store_id, created_at DESC);
CREATE INDEX quotes_client_id_idx ON public.quotes (client_id);

CREATE OR REPLACE FUNCTION public.set_quote_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_seq int;
BEGIN
  IF NEW.quote_number IS NULL OR NEW.quote_number = '' THEN
    SELECT count(*) + 1 INTO v_seq FROM public.quotes WHERE store_id = NEW.store_id;
    NEW.quote_number := 'Q-' || lpad(v_seq::text, 4, '0');
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_quote_number() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER set_quote_number_trigger
BEFORE INSERT ON public.quotes
FOR EACH ROW EXECUTE FUNCTION public.set_quote_number();

CREATE OR REPLACE FUNCTION public.set_quote_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_quote_updated_at() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER set_quote_updated_at_trigger
BEFORE UPDATE ON public.quotes
FOR EACH ROW EXECUTE FUNCTION public.set_quote_updated_at();

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY quotes_select ON public.quotes FOR SELECT TO authenticated
  USING (public.is_store_member(store_id));

CREATE POLICY quotes_insert ON public.quotes FOR INSERT TO authenticated
  WITH CHECK (
    public.has_store_role(store_id, ARRAY['owner', 'manager'])
    OR EXISTS (
      SELECT 1 FROM public.store_members sm
      WHERE sm.store_id = quotes.store_id
        AND sm.user_id = auth.uid()
        AND sm.role = 'tailor'
        AND sm.status = 'active'
        AND sm.can_manage_quotations
    )
  );

CREATE POLICY quotes_update ON public.quotes FOR UPDATE TO authenticated
  USING (
    public.has_store_role(store_id, ARRAY['owner', 'manager'])
    OR EXISTS (
      SELECT 1 FROM public.store_members sm
      WHERE sm.store_id = quotes.store_id
        AND sm.user_id = auth.uid()
        AND sm.role = 'tailor'
        AND sm.status = 'active'
        AND sm.can_manage_quotations
    )
  )
  WITH CHECK (
    public.has_store_role(store_id, ARRAY['owner', 'manager'])
    OR EXISTS (
      SELECT 1 FROM public.store_members sm
      WHERE sm.store_id = quotes.store_id
        AND sm.user_id = auth.uid()
        AND sm.role = 'tailor'
        AND sm.status = 'active'
        AND sm.can_manage_quotations
    )
  );

CREATE POLICY quotes_delete ON public.quotes FOR DELETE TO authenticated
  USING (public.has_store_role(store_id, ARRAY['owner', 'manager']));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotes TO authenticated;
GRANT ALL ON public.quotes TO service_role;

-- A new grantable ability: by default a tailor can't create/send quotes,
-- but an owner/manager can switch this on for them from Staff, without
-- handing over full order-management rights.
ALTER TABLE public.store_members
  ADD COLUMN IF NOT EXISTS can_manage_quotations boolean NOT NULL DEFAULT false;
