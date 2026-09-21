-- Security fix L4 (High): payout account changes needed only a normal
-- owner/manager session, had no cooldown, no history (the upsert overwrote
-- the previous bank details in place), and produced no audit trail.
--
-- connect-payment-account (the only write path) runs as service_role, so a
-- grant/RLS change cannot gate this — the guard has to be a trigger, which
-- fires regardless of which role performs the write. This is deliberately
-- NOT exempted for service_role, unlike the L1 stores trigger: service_role
-- is not "the trusted legitimate path" here, it is the *only* path (the
-- edge function always writes as service_role), so the cooldown has to
-- apply to it too or it would apply to nothing.
--
-- Two pieces delivered here (DB layer, no external dependency):
--   1. payment_account_changes: an append-only history table, so the old
--      bank details are never silently lost to the upsert again.
--   2. A 24-hour cooldown: a payout account cannot be changed again within
--      24 hours of its last change, blunting a hijack-then-immediately-
--      drain attempt even without notifications in place yet.
--
-- Two pieces from the original recommendation are NOT delivered here and
-- are tracked separately (task #34): an OTP to the registered WhatsApp
-- number, and notifying the owner on change — both need the WhatsApp
-- Business API / Resend integrations, which remain stubbed pending the
-- store operator's own API keys. Password re-entry before calling the edge
-- function is added at the application layer instead (no DB change needed
-- for that piece — see the accompanying frontend change).

CREATE TABLE IF NOT EXISTS public.payment_account_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid,
  old_provider text,
  old_bank_code text,
  old_bank_name text,
  old_account_number text,
  old_account_name text,
  old_status text,
  new_provider text,
  new_bank_code text,
  new_bank_name text,
  new_account_number text,
  new_account_name text,
  new_status text
);

ALTER TABLE public.payment_account_changes ENABLE ROW LEVEL SECURITY;

-- Owner-only read: this is the one place a store's full payout-account
-- change history (including past account numbers) is visible, so it's
-- scoped tighter than the usual owner/manager split.
DROP POLICY IF EXISTS payment_account_changes_owner_read ON public.payment_account_changes;
CREATE POLICY payment_account_changes_owner_read
  ON public.payment_account_changes FOR SELECT TO authenticated
  USING (has_store_role(store_id, ARRAY['owner'::store_role]));

-- No INSERT/UPDATE/DELETE grant to anon/authenticated at all: only the
-- SECURITY DEFINER trigger below writes here, from inside the same
-- transaction as the payment_accounts write it's recording.
REVOKE ALL ON public.payment_account_changes FROM anon, authenticated;
GRANT SELECT ON public.payment_account_changes TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_payment_account_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_change timestamptz;
  v_cooldown interval := interval '24 hours';
BEGIN
  SELECT max(changed_at) INTO v_last_change
  FROM public.payment_account_changes
  WHERE store_id = NEW.store_id;

  IF v_last_change IS NOT NULL AND now() - v_last_change < v_cooldown THEN
    RAISE EXCEPTION
      'This store''s payout account was changed less than 24 hours ago. For security, please wait before changing it again, or contact support for an emergency override.'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.payment_account_changes (
    store_id, changed_by,
    old_provider, old_bank_code, old_bank_name, old_account_number, old_account_name, old_status,
    new_provider, new_bank_code, new_bank_name, new_account_number, new_account_name, new_status
  ) VALUES (
    NEW.store_id, auth.uid(),
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.provider END,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.bank_code END,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.bank_name END,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.account_number END,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.account_name END,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END,
    NEW.provider, NEW.bank_code, NEW.bank_name, NEW.account_number, NEW.account_name, NEW.status
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_accounts_guard ON public.payment_accounts;
CREATE TRIGGER payment_accounts_guard
  BEFORE INSERT OR UPDATE ON public.payment_accounts
  FOR EACH ROW EXECUTE FUNCTION public.guard_payment_account_change();
