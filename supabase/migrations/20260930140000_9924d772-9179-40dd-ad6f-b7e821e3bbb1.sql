-- PR F: piece-rate staff payroll (Business and Custom plans).
--
-- Nigerian fashion houses usually pay tailors per garment or per stage, not
-- per hour. This adds pay rates per (garment type, stage), a trigger that
-- turns every order_status_history row into an earning for whoever held the
-- order during the stage just left, and weekly payroll runs. Safe to run
-- more than once.

BEGIN;

-- 1. Gate: a boolean "payroll" key on plans.limits, read through the
--    existing feature_usage() (so the trial-period rule already coded
--    there applies automatically -- no new gating logic needed).
UPDATE public.plans SET limits = limits || jsonb_build_object('payroll', true)
WHERE code IN ('business', 'custom');
UPDATE public.plans SET limits = limits || jsonb_build_object('payroll', false)
WHERE code IN ('free', 'growth');

-- 2. order_status_history.assigned_to -- who held the order during the
--    stage recorded on this row. No FK, same convention as
--    orders.assigned_to/changed_by (a plain auth user id).
ALTER TABLE public.order_status_history ADD COLUMN IF NOT EXISTS assigned_to uuid;

-- 3. log_order_status_change() -- reproduced from its live definition
--    (confirmed via pg_get_functiondef before writing this), with only
--    assigned_to added to both INSERTs: NEW.assigned_to when the order is
--    created, OLD.assigned_to (who held it during from_status) on a status
--    change. Everything else is unchanged, including that this trigger is
--    AFTER INSERT OR UPDATE and never touches ready_at/collected_at (those
--    are set by the separate set_order_timestamps() trigger, untouched
--    here).
CREATE OR REPLACE FUNCTION public.log_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, assigned_to)
    VALUES (NEW.id, NULL, NEW.status, auth.uid(), NEW.assigned_to);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, assigned_to)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid(), OLD.assigned_to);
  END IF;
  RETURN NEW;
END;
$function$;

-- 4. Pay rates: one amount per (store, garment type, stage). 'whole' means
--    "pay once for the whole garment at ready", which then makes every
--    per-stage rate for that garment type a no-op (see the earnings
--    trigger below).
CREATE TABLE IF NOT EXISTS public.pay_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id),
  garment_type_code text NOT NULL REFERENCES public.garment_types(code),
  stage text NOT NULL CHECK (stage IN
    ('received', 'cutting', 'sewing', 'fitting', 'adjustments', 'ready', 'collected', 'whole')),
  amount numeric NOT NULL DEFAULT 0 CHECK (amount >= 0),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pay_rates_store_garment_stage_unique UNIQUE (store_id, garment_type_code, stage)
);
ALTER TABLE public.pay_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pay_rates_member_select ON public.pay_rates;
CREATE POLICY pay_rates_member_select ON public.pay_rates FOR SELECT TO authenticated
  USING (public.is_store_member(store_id));
-- No direct INSERT/UPDATE/DELETE policy -- rates are only ever written
-- through upsert_pay_rate(), which is owner-only.

-- 5. Payroll runs and their per-member lines, created before staff_earnings
--    so its payroll_run_id FK can reference payroll_runs.
CREATE TABLE IF NOT EXISTS public.payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'paid')),
  created_by uuid,
  paid_at timestamptz,
  paid_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_runs_store_period_unique UNIQUE (store_id, period_start, period_end)
);
ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payroll_runs_owner_manager_select ON public.payroll_runs;
CREATE POLICY payroll_runs_owner_manager_select ON public.payroll_runs FOR SELECT TO authenticated
  USING (public.has_store_role(store_id, ARRAY['owner'::store_role, 'manager'::store_role]));
-- No direct mutation policy -- only generate_payroll_run()/mark_payroll_run_paid().

CREATE TABLE IF NOT EXISTS public.payroll_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id),
  member_ref uuid NOT NULL,
  jobs_count integer NOT NULL DEFAULT 0,
  gross numeric NOT NULL DEFAULT 0,
  advances numeric NOT NULL DEFAULT 0,
  net numeric NOT NULL DEFAULT 0,
  carried_forward numeric NOT NULL DEFAULT 0,
  CONSTRAINT payroll_lines_run_member_unique UNIQUE (run_id, member_ref)
);
ALTER TABLE public.payroll_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payroll_lines_owner_manager_select ON public.payroll_lines;
CREATE POLICY payroll_lines_owner_manager_select ON public.payroll_lines FOR SELECT TO authenticated
  USING (public.has_store_role(store_id, ARRAY['owner'::store_role, 'manager'::store_role]));
DROP POLICY IF EXISTS payroll_lines_self_select ON public.payroll_lines;
CREATE POLICY payroll_lines_self_select ON public.payroll_lines FOR SELECT TO authenticated
  USING (member_ref = auth.uid() AND public.is_store_member(store_id));
-- No direct mutation policy -- only generate_payroll_run() writes these.

-- 6. Earnings. The rate is captured onto the row at the time it's earned,
--    so a later rate change never alters a past earning. Exactly one row
--    per (order, stage) ever -- rework (leaving the same stage twice) must
--    not pay twice, enforced by the unique constraint plus ON CONFLICT DO
--    NOTHING in the trigger below.
CREATE TABLE IF NOT EXISTS public.staff_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  member_ref uuid,
  stage text NOT NULL CHECK (stage IN
    ('received', 'cutting', 'sewing', 'fitting', 'adjustments', 'ready', 'collected', 'whole')),
  garment_type_code text,
  quantity numeric NOT NULL DEFAULT 1,
  rate numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  earned_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'earned' CHECK (status IN ('earned', 'needs_rate', 'unassigned', 'voided')),
  void_reason text,
  payroll_run_id uuid REFERENCES public.payroll_runs(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_earnings_order_stage_unique UNIQUE (order_id, stage)
);
ALTER TABLE public.staff_earnings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_earnings_owner_manager_select ON public.staff_earnings;
CREATE POLICY staff_earnings_owner_manager_select ON public.staff_earnings FOR SELECT TO authenticated
  USING (public.has_store_role(store_id, ARRAY['owner'::store_role, 'manager'::store_role]));
DROP POLICY IF EXISTS staff_earnings_self_select ON public.staff_earnings;
CREATE POLICY staff_earnings_self_select ON public.staff_earnings FOR SELECT TO authenticated
  USING (member_ref = auth.uid() AND public.is_store_member(store_id));
-- No direct mutation policy -- only the trigger below, fix_staff_earning(),
-- void_staff_earning() and generate_payroll_run() write these.

-- 7. Advances, deducted against a member's next payroll run.
CREATE TABLE IF NOT EXISTS public.staff_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id),
  member_ref uuid NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  note text,
  given_at timestamptz NOT NULL DEFAULT now(),
  given_by uuid,
  payroll_run_id uuid REFERENCES public.payroll_runs(id)
);
ALTER TABLE public.staff_advances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_advances_owner_manager_select ON public.staff_advances;
CREATE POLICY staff_advances_owner_manager_select ON public.staff_advances FOR SELECT TO authenticated
  USING (public.has_store_role(store_id, ARRAY['owner'::store_role, 'manager'::store_role]));
DROP POLICY IF EXISTS staff_advances_self_select ON public.staff_advances;
CREATE POLICY staff_advances_self_select ON public.staff_advances FOR SELECT TO authenticated
  USING (member_ref = auth.uid() AND public.is_store_member(store_id));
-- No direct mutation policy -- only record_staff_advance()/generate_payroll_run().

-- 8. The earnings trigger. Fires once per order_status_history row (i.e.
--    once per real status change -- log_order_status_change() above never
--    inserts a no-op row). Skips the very first row (from_status IS NULL,
--    nothing was "completed" yet).
CREATE OR REPLACE FUNCTION public.create_staff_earning_on_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_whole_rate numeric;
  v_stage_rate numeric;
  v_member uuid;
BEGIN
  IF NEW.from_status IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = NEW.order_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- If this garment type is paid as a whole (one amount for the finished
  -- garment), every per-stage rate for it is ignored -- the only payout is
  -- a single 'whole' row, credited once when the order reaches 'ready'.
  SELECT amount INTO v_whole_rate FROM public.pay_rates
  WHERE store_id = v_order.store_id AND garment_type_code = v_order.garment_type_code AND stage = 'whole';

  IF FOUND THEN
    IF NEW.to_status = 'ready' THEN
      v_member := NEW.assigned_to;
      INSERT INTO public.staff_earnings
        (store_id, order_id, member_ref, stage, garment_type_code, quantity, rate, amount, status)
      VALUES (
        v_order.store_id, v_order.id, v_member, 'whole', v_order.garment_type_code,
        v_order.quantity, v_whole_rate, v_whole_rate * v_order.quantity,
        CASE WHEN v_member IS NULL THEN 'unassigned' ELSE 'earned' END
      )
      ON CONFLICT ON CONSTRAINT staff_earnings_order_stage_unique DO NOTHING;
    END IF;
    RETURN NEW;
  END IF;

  -- Otherwise, credit whoever held the order during the stage it just left.
  v_member := NEW.assigned_to;
  SELECT amount INTO v_stage_rate FROM public.pay_rates
  WHERE store_id = v_order.store_id AND garment_type_code = v_order.garment_type_code AND stage = NEW.from_status;

  INSERT INTO public.staff_earnings
    (store_id, order_id, member_ref, stage, garment_type_code, quantity, rate, amount, status)
  VALUES (
    v_order.store_id, v_order.id, v_member, NEW.from_status, v_order.garment_type_code,
    v_order.quantity, coalesce(v_stage_rate, 0), coalesce(v_stage_rate, 0) * v_order.quantity,
    CASE
      WHEN NOT FOUND THEN 'needs_rate'
      WHEN v_member IS NULL THEN 'unassigned'
      ELSE 'earned'
    END
  )
  ON CONFLICT ON CONSTRAINT staff_earnings_order_stage_unique DO NOTHING;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_staff_earning_on_status_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS create_staff_earning_on_status_change_trigger ON public.order_status_history;
CREATE TRIGGER create_staff_earning_on_status_change_trigger
AFTER INSERT ON public.order_status_history
FOR EACH ROW EXECUTE FUNCTION public.create_staff_earning_on_status_change();

-- 9. Owner-only: set a rate.
CREATE OR REPLACE FUNCTION public.upsert_pay_rate(
  p_store_id uuid, p_garment_type_code text, p_stage text, p_amount numeric
)
RETURNS public.pay_rates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.pay_rates%ROWTYPE;
BEGIN
  IF NOT public.has_store_role(p_store_id, ARRAY['owner'::store_role]) THEN
    RAISE EXCEPTION 'Only the owner can edit pay rates' USING ERRCODE = 'P0108';
  END IF;
  IF p_amount < 0 THEN
    RAISE EXCEPTION 'Rate cannot be negative' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.pay_rates (store_id, garment_type_code, stage, amount, updated_by, updated_at)
  VALUES (p_store_id, p_garment_type_code, p_stage, p_amount, auth.uid(), now())
  ON CONFLICT ON CONSTRAINT pay_rates_store_garment_stage_unique
  DO UPDATE SET amount = excluded.amount, updated_by = excluded.updated_by, updated_at = excluded.updated_at
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.upsert_pay_rate(uuid, text, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_pay_rate(uuid, text, text, numeric) TO authenticated;

-- 10. Owner/manager: resolve a needs_rate/unassigned row (or correct an
--     earned one) by supplying whichever piece was missing. Blocked once
--     the earning belongs to a paid run.
CREATE OR REPLACE FUNCTION public.fix_staff_earning(
  p_earning_id uuid, p_member_ref uuid DEFAULT NULL, p_rate numeric DEFAULT NULL
)
RETURNS public.staff_earnings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_earning public.staff_earnings%ROWTYPE;
  v_run_status text;
  v_member uuid;
  v_rate numeric;
BEGIN
  SELECT * INTO v_earning FROM public.staff_earnings WHERE id = p_earning_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Earning not found' USING ERRCODE = 'P0102';
  END IF;
  IF NOT public.has_store_role(v_earning.store_id, ARRAY['owner'::store_role, 'manager'::store_role]) THEN
    RAISE EXCEPTION 'Only the owner or a manager can fix earnings' USING ERRCODE = 'P0108';
  END IF;
  IF v_earning.status = 'voided' THEN
    RAISE EXCEPTION 'This earning was voided' USING ERRCODE = 'P0109';
  END IF;
  SELECT status INTO v_run_status FROM public.payroll_runs WHERE id = v_earning.payroll_run_id;
  IF v_run_status = 'paid' THEN
    RAISE EXCEPTION 'This earning has already been paid' USING ERRCODE = 'P0110';
  END IF;

  v_member := coalesce(p_member_ref, v_earning.member_ref);
  v_rate := coalesce(p_rate, v_earning.rate);

  UPDATE public.staff_earnings
  SET member_ref = v_member,
      rate = v_rate,
      amount = v_rate * quantity,
      status = CASE WHEN v_member IS NULL THEN 'unassigned' ELSE 'earned' END
  WHERE id = p_earning_id
  RETURNING * INTO v_earning;

  RETURN v_earning;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fix_staff_earning(uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fix_staff_earning(uuid, uuid, numeric) TO authenticated;

-- 11. Owner/manager: void an unpaid earning with a reason.
CREATE OR REPLACE FUNCTION public.void_staff_earning(p_earning_id uuid, p_reason text)
RETURNS public.staff_earnings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_earning public.staff_earnings%ROWTYPE;
  v_run_status text;
BEGIN
  SELECT * INTO v_earning FROM public.staff_earnings WHERE id = p_earning_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Earning not found' USING ERRCODE = 'P0102';
  END IF;
  IF NOT public.has_store_role(v_earning.store_id, ARRAY['owner'::store_role, 'manager'::store_role]) THEN
    RAISE EXCEPTION 'Only the owner or a manager can void earnings' USING ERRCODE = 'P0108';
  END IF;
  SELECT status INTO v_run_status FROM public.payroll_runs WHERE id = v_earning.payroll_run_id;
  IF v_run_status = 'paid' THEN
    RAISE EXCEPTION 'This earning has already been paid' USING ERRCODE = 'P0110';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'A reason is required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.staff_earnings
  SET status = 'voided', void_reason = trim(p_reason)
  WHERE id = p_earning_id
  RETURNING * INTO v_earning;

  RETURN v_earning;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.void_staff_earning(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_staff_earning(uuid, text) TO authenticated;

-- 12. Owner/manager: record an advance against a member's future earnings.
CREATE OR REPLACE FUNCTION public.record_staff_advance(
  p_store_id uuid, p_member_ref uuid, p_amount numeric, p_note text DEFAULT NULL
)
RETURNS public.staff_advances
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.staff_advances%ROWTYPE;
BEGIN
  IF NOT public.has_store_role(p_store_id, ARRAY['owner'::store_role, 'manager'::store_role]) THEN
    RAISE EXCEPTION 'Only the owner or a manager can record advances' USING ERRCODE = 'P0108';
  END IF;
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Advance amount must be positive' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.staff_advances (store_id, member_ref, amount, note, given_by)
  VALUES (p_store_id, p_member_ref, p_amount, nullif(trim(coalesce(p_note, '')), ''), auth.uid())
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.record_staff_advance(uuid, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_staff_advance(uuid, uuid, numeric, text) TO authenticated;

-- 13. Owner/manager, read-only: needs_rate/unassigned rows in a period, so
--     the UI can warn before generating a run. Does not block generation --
--     those rows are simply excluded until fixed.
CREATE OR REPLACE FUNCTION public.get_payroll_period_warnings(
  p_store_id uuid, p_period_start date, p_period_end date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  IF NOT public.has_store_role(p_store_id, ARRAY['owner'::store_role, 'manager'::store_role]) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', se.id, 'order_id', se.order_id, 'stage', se.stage,
    'status', se.status, 'earned_at', se.earned_at
  ) ORDER BY se.earned_at), '[]'::jsonb)
  INTO v_rows
  FROM public.staff_earnings se
  WHERE se.store_id = p_store_id
    AND se.status IN ('needs_rate', 'unassigned')
    AND se.payroll_run_id IS NULL
    AND se.earned_at >= (p_period_start::timestamp AT TIME ZONE 'Africa/Lagos')
    AND se.earned_at < ((p_period_end + 1)::timestamp AT TIME ZONE 'Africa/Lagos');

  RETURN v_rows;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_payroll_period_warnings(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_payroll_period_warnings(uuid, date, date) TO authenticated;

-- 14. Owner/manager, feature-gated: generate (or regenerate) a draft run
--     for a period. Regenerating unlinks this run's previous earnings and
--     advances first, so it always reflects what's unpaid right now.
--     Any negative net becomes a fresh, unlinked advance, which is how the
--     shortfall carries into whichever run is generated next.
CREATE OR REPLACE FUNCTION public.generate_payroll_run(
  p_store_id uuid, p_period_start date, p_period_end date
)
RETURNS public.payroll_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run public.payroll_runs%ROWTYPE;
  v_allowed boolean;
BEGIN
  IF NOT public.has_store_role(p_store_id, ARRAY['owner'::store_role, 'manager'::store_role]) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT (public.feature_usage(p_store_id, 'payroll') ->> 'allowed')::boolean INTO v_allowed;
  IF NOT coalesce(v_allowed, false) THEN
    RAISE EXCEPTION 'Payroll requires the Business plan' USING ERRCODE = 'P0111';
  END IF;

  SELECT * INTO v_run FROM public.payroll_runs
  WHERE store_id = p_store_id AND period_start = p_period_start AND period_end = p_period_end;

  IF FOUND THEN
    IF v_run.status = 'paid' THEN
      RAISE EXCEPTION 'This payroll period has already been paid' USING ERRCODE = 'P0112';
    END IF;
    UPDATE public.staff_earnings SET payroll_run_id = NULL WHERE payroll_run_id = v_run.id;
    UPDATE public.staff_advances SET payroll_run_id = NULL WHERE payroll_run_id = v_run.id;
    DELETE FROM public.payroll_lines WHERE run_id = v_run.id;
  ELSE
    INSERT INTO public.payroll_runs (store_id, period_start, period_end, created_by)
    VALUES (p_store_id, p_period_start, p_period_end, auth.uid())
    RETURNING * INTO v_run;
  END IF;

  UPDATE public.staff_earnings
  SET payroll_run_id = v_run.id
  WHERE store_id = p_store_id AND status = 'earned' AND payroll_run_id IS NULL
    AND earned_at >= (p_period_start::timestamp AT TIME ZONE 'Africa/Lagos')
    AND earned_at < ((p_period_end + 1)::timestamp AT TIME ZONE 'Africa/Lagos');

  UPDATE public.staff_advances
  SET payroll_run_id = v_run.id
  WHERE store_id = p_store_id AND payroll_run_id IS NULL
    AND given_at < ((p_period_end + 1)::timestamp AT TIME ZONE 'Africa/Lagos');

  INSERT INTO public.payroll_lines (run_id, store_id, member_ref, jobs_count, gross, advances, net, carried_forward)
  SELECT
    v_run.id, p_store_id, m.member_ref,
    coalesce(e.jobs_count, 0), coalesce(e.gross, 0), coalesce(a.advances, 0),
    GREATEST(coalesce(e.gross, 0) - coalesce(a.advances, 0), 0),
    GREATEST(coalesce(a.advances, 0) - coalesce(e.gross, 0), 0)
  FROM (
    SELECT member_ref FROM public.staff_earnings WHERE payroll_run_id = v_run.id
    UNION
    SELECT member_ref FROM public.staff_advances WHERE payroll_run_id = v_run.id
  ) m
  LEFT JOIN (
    SELECT member_ref, count(*) AS jobs_count, sum(amount) AS gross
    FROM public.staff_earnings WHERE payroll_run_id = v_run.id GROUP BY member_ref
  ) e ON e.member_ref = m.member_ref
  LEFT JOIN (
    SELECT member_ref, sum(amount) AS advances
    FROM public.staff_advances WHERE payroll_run_id = v_run.id GROUP BY member_ref
  ) a ON a.member_ref = m.member_ref
  WHERE m.member_ref IS NOT NULL;

  INSERT INTO public.staff_advances (store_id, member_ref, amount, note, given_by)
  SELECT p_store_id, pl.member_ref, pl.carried_forward,
         'Carried forward from ' || p_period_start || ' to ' || p_period_end, auth.uid()
  FROM public.payroll_lines pl
  WHERE pl.run_id = v_run.id AND pl.carried_forward > 0;

  RETURN v_run;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.generate_payroll_run(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_payroll_run(uuid, date, date) TO authenticated;

-- 15. Owner-only: lock a run. The linkage was already set at generation
--     time, so this only needs to flip the run's own status.
CREATE OR REPLACE FUNCTION public.mark_payroll_run_paid(p_run_id uuid)
RETURNS public.payroll_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run public.payroll_runs%ROWTYPE;
BEGIN
  SELECT * INTO v_run FROM public.payroll_runs WHERE id = p_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll run not found' USING ERRCODE = 'P0102';
  END IF;
  IF NOT public.has_store_role(v_run.store_id, ARRAY['owner'::store_role]) THEN
    RAISE EXCEPTION 'Only the owner can mark payroll as paid' USING ERRCODE = 'P0108';
  END IF;
  IF v_run.status = 'paid' THEN
    RETURN v_run;
  END IF;

  UPDATE public.payroll_runs
  SET status = 'paid', paid_at = now(), paid_by = auth.uid()
  WHERE id = p_run_id
  RETURNING * INTO v_run;

  RETURN v_run;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.mark_payroll_run_paid(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_payroll_run_paid(uuid) TO authenticated;

-- 16. Verification -- one row: all_true, and which checks (if any) failed.
SELECT
  bool_and(v) AS all_true,
  coalesce(string_agg(k, ', ') FILTER (WHERE NOT v), 'none') AS failed_checks
FROM (VALUES
  ('plans_payroll_key', coalesce((
    SELECT bool_and(limits ? 'payroll') FROM public.plans
    WHERE code IN ('free', 'growth', 'business', 'custom')
  ), false)),
  ('plans_payroll_business_custom_true', coalesce((
    SELECT bool_and((limits ->> 'payroll')::boolean) FROM public.plans WHERE code IN ('business', 'custom')
  ), false)),
  ('plans_payroll_free_growth_false', coalesce((
    SELECT bool_and(NOT (limits ->> 'payroll')::boolean) FROM public.plans WHERE code IN ('free', 'growth')
  ), false)),
  ('order_status_history_assigned_to', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_status_history' AND column_name = 'assigned_to'
  )),
  ('log_order_status_change_fn', to_regprocedure('public.log_order_status_change()') IS NOT NULL),
  ('pay_rates_table', to_regclass('public.pay_rates') IS NOT NULL),
  ('staff_earnings_table', to_regclass('public.staff_earnings') IS NOT NULL),
  ('staff_advances_table', to_regclass('public.staff_advances') IS NOT NULL),
  ('payroll_runs_table', to_regclass('public.payroll_runs') IS NOT NULL),
  ('payroll_lines_table', to_regclass('public.payroll_lines') IS NOT NULL),
  ('staff_earnings_unique_order_stage', EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'staff_earnings_order_stage_unique'
  )),
  ('create_staff_earning_trigger', EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'create_staff_earning_on_status_change_trigger'
  )),
  ('upsert_pay_rate_fn', to_regprocedure('public.upsert_pay_rate(uuid,text,text,numeric)') IS NOT NULL),
  ('fix_staff_earning_fn', to_regprocedure('public.fix_staff_earning(uuid,uuid,numeric)') IS NOT NULL),
  ('void_staff_earning_fn', to_regprocedure('public.void_staff_earning(uuid,text)') IS NOT NULL),
  ('record_staff_advance_fn', to_regprocedure('public.record_staff_advance(uuid,uuid,numeric,text)') IS NOT NULL),
  ('get_payroll_period_warnings_fn', to_regprocedure('public.get_payroll_period_warnings(uuid,date,date)') IS NOT NULL),
  ('generate_payroll_run_fn', to_regprocedure('public.generate_payroll_run(uuid,date,date)') IS NOT NULL),
  ('mark_payroll_run_paid_fn', to_regprocedure('public.mark_payroll_run_paid(uuid)') IS NOT NULL),
  ('pay_rates_rls_enabled', coalesce((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.pay_rates'::regclass), false)),
  ('staff_earnings_rls_enabled', coalesce((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.staff_earnings'::regclass), false)),
  ('staff_advances_rls_enabled', coalesce((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.staff_advances'::regclass), false)),
  ('payroll_runs_rls_enabled', coalesce((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.payroll_runs'::regclass), false)),
  ('payroll_lines_rls_enabled', coalesce((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.payroll_lines'::regclass), false))
) AS checks(k, v);

COMMIT;
