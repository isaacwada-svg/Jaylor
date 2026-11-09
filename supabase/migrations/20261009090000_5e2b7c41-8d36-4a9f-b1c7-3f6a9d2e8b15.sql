-- PR U: Home dashboard in one round trip.
--
-- get_home_dashboard(p_store_id) returns everything the rebuilt Home screen
-- and the app shell's nav badges need as one jsonb document, so a phone on a
-- slow connection makes one request instead of one per card.
--
-- Rules carried over from the existing screens, not new policy:
-- - Money (collections, margin, owed, payments, who owes) is only computed
--   for owners and managers. A tailor gets their own assigned jobs instead,
--   and every money key is null for them.
-- - Money is NGN only (same as Reports and the digests): other-currency
--   orders and payments are never mixed into these totals.
-- - Balances come from the private _store_order_balances() helper (the same
--   formula as the order_balances view), called only after the membership
--   and role checks above it.
-- - Plan gates match what is already enforced elsewhere:
--     profit margin  -> business/custom plan or an active trial
--                       (same rule as has_health_report_access)
--     fittings today -> _store_has_feature(store, 'consultations')
--     low stock      -> _store_has_feature(store, 'inventory')
-- - Days and hours are in the store's own timezone (stores.timezone).
--
-- Also adds two indexes the function's range scans use. Safe to run more
-- than once.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_payments_store_paid_at
  ON public.payments (store_id, paid_at);
CREATE INDEX IF NOT EXISTS idx_orders_store_delivery_date
  ON public.orders (store_id, delivery_date);

CREATE OR REPLACE FUNCTION public.get_home_dashboard(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_money boolean;
  v_tz text;
  v_plan text;
  v_trial_ends timestamptz;
  v_profit_access boolean;
  v_fittings_access boolean;
  v_inventory_access boolean;
  v_now timestamptz := now();
  v_today date;
  v_day_start timestamptz;
  v_month_start date;
  v_prev_month_start date;
  v_prev_month_end date;
  v_result jsonb;
  v_work jsonb;
  v_money_json jsonb := NULL;
  v_fittings jsonb := NULL;
  v_low_stock jsonb := NULL;
  v_my_jobs jsonb := NULL;
BEGIN
  IF v_uid IS NULL OR NOT public.is_store_member(p_store_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(nullif(timezone, ''), 'Africa/Lagos'), plan_code, trial_ends_at
  INTO v_tz, v_plan, v_trial_ends
  FROM public.stores WHERE id = p_store_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Store not found' USING ERRCODE = 'P0002';
  END IF;

  v_money := public.has_store_role(p_store_id, ARRAY['owner'::store_role, 'manager'::store_role]);
  v_profit_access := coalesce(v_plan IN ('business', 'custom'), false)
    OR (v_trial_ends IS NOT NULL AND v_trial_ends > v_now);
  v_fittings_access := public._store_has_feature(p_store_id, 'consultations');
  v_inventory_access := public._store_has_feature(p_store_id, 'inventory');

  v_today := (v_now AT TIME ZONE v_tz)::date;
  v_day_start := v_today::timestamp AT TIME ZONE v_tz;
  v_month_start := date_trunc('month', v_today)::date;
  v_prev_month_start := (v_month_start - interval '1 month')::date;
  -- Same span of last month as this month so far (1st..same day), capped at
  -- last month's own last day.
  v_prev_month_end := least(
    v_prev_month_start + (v_today - v_month_start),
    v_month_start - 1
  );

  -- ------------------------------------------------------------------
  -- Work due: owners/managers see the whole store, a tailor only the jobs
  -- assigned to them. "Due soon" is unfinished work (not ready, collected
  -- or cancelled) that is overdue or due within 3 days.
  -- ------------------------------------------------------------------
  WITH active AS (
    SELECT o.id, o.number, o.garment_type, o.quantity, o.delivery_date, o.status,
           o.client_id, o.currency
    FROM public.orders o
    WHERE o.store_id = p_store_id
      AND o.status NOT IN ('ready', 'collected', 'cancelled')
      AND (v_money OR o.assigned_to = v_uid)
  ),
  due AS (
    SELECT a.*, c.full_name AS client_name,
           (a.delivery_date - v_today) AS days_left,
           CASE WHEN v_money THEN b.balance END AS balance
    FROM active a
    LEFT JOIN public.clients c ON c.id = a.client_id
    LEFT JOIN public._store_order_balances(p_store_id) b
      ON v_money AND b.order_id = a.id
    WHERE a.delivery_date IS NOT NULL AND a.delivery_date <= v_today + 3
  )
  SELECT jsonb_build_object(
    'due_soon_count', (SELECT count(*) FROM due),
    'due_soon', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'order_id', d.id,
        'number', d.number,
        'garment_type', d.garment_type,
        'quantity', d.quantity,
        'client_name', d.client_name,
        'delivery_date', d.delivery_date,
        'days_left', d.days_left,
        'status', d.status,
        'balance', CASE WHEN d.currency = 'NGN' THEN d.balance END
      ) ORDER BY d.delivery_date, d.number)
      FROM (SELECT * FROM due ORDER BY delivery_date, number LIMIT 8) d
    ), '[]'::jsonb),
    'week_garments', (SELECT coalesce(sum(quantity), 0) FROM active
      WHERE delivery_date BETWEEN v_today AND v_today + 6),
    'today_garments', (SELECT coalesce(sum(quantity), 0) FROM active
      WHERE delivery_date = v_today),
    'overdue_garments', (SELECT coalesce(sum(quantity), 0) FROM active
      WHERE delivery_date < v_today),
    'active_orders', (SELECT count(*) FROM active)
  ) INTO v_work;

  -- ------------------------------------------------------------------
  -- Fittings today (Growth and above).
  -- ------------------------------------------------------------------
  IF v_fittings_access THEN
    SELECT jsonb_build_object(
      'count', count(*),
      'items', coalesce(jsonb_agg(jsonb_build_object(
        'id', f.id,
        'starts_at', f.starts_at,
        'purpose', f.purpose,
        'type', f.type,
        'client_name', f.client_name,
        'garment_type', f.garment_type,
        'order_id', f.order_id
      ) ORDER BY f.starts_at) FILTER (WHERE f.rn <= 8), '[]'::jsonb)
    ) INTO v_fittings
    FROM (
      SELECT k.id, k.starts_at, k.purpose, k.type, k.order_id,
             c.full_name AS client_name, o.garment_type,
             row_number() OVER (ORDER BY k.starts_at) AS rn
      FROM public.consultations k
      LEFT JOIN public.clients c ON c.id = k.client_id
      LEFT JOIN public.orders o ON o.id = k.order_id
      WHERE k.store_id = p_store_id
        AND k.starts_at >= v_day_start
        AND k.starts_at < v_day_start + interval '1 day'
        AND k.status NOT IN ('cancelled', 'declined')
    ) f;
  END IF;

  -- ------------------------------------------------------------------
  -- Tailor view: their own jobs, soonest due first. No money.
  -- ------------------------------------------------------------------
  IF NOT v_money THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'order_id', j.id,
      'number', j.number,
      'garment_type', j.garment_type,
      'quantity', j.quantity,
      'delivery_date', j.delivery_date,
      'status', j.status
    ) ORDER BY j.delivery_date NULLS LAST, j.number), '[]'::jsonb)
    INTO v_my_jobs
    FROM (
      SELECT o.id, o.number, o.garment_type, o.quantity, o.delivery_date, o.status
      FROM public.orders o
      WHERE o.store_id = p_store_id
        AND o.assigned_to = v_uid
        AND o.status NOT IN ('collected', 'cancelled')
      ORDER BY o.delivery_date NULLS LAST, o.number
      LIMIT 12
    ) j;
  END IF;

  -- ------------------------------------------------------------------
  -- Money: owners and managers only.
  -- ------------------------------------------------------------------
  IF v_money THEN
    IF v_inventory_access THEN
      SELECT jsonb_build_object(
        'count', count(*),
        'items', coalesce(jsonb_agg(jsonb_build_object(
          'id', s.id,
          'name', s.name,
          'unit', s.unit,
          'quantity', s.quantity,
          'reorder_level', s.reorder_level
        ) ORDER BY s.ratio, s.name) FILTER (WHERE s.rn <= 8), '[]'::jsonb)
      ) INTO v_low_stock
      FROM (
        SELECT i.id, i.name, i.unit, i.quantity, i.reorder_level,
               i.quantity::numeric / nullif(i.reorder_level, 0) AS ratio,
               row_number() OVER (
                 ORDER BY i.quantity::numeric / nullif(i.reorder_level, 0), i.name
               ) AS rn
        FROM public.inventory_items i
        WHERE i.store_id = p_store_id
          AND i.is_active
          AND i.reorder_level > 0
          AND i.quantity <= i.reorder_level
      ) s;
    END IF;

    WITH pay AS (
      SELECT p.id, p.order_id, p.amount, p.method, p.paid_at,
             (p.paid_at AT TIME ZONE v_tz) AS local_ts
      FROM public.payments p
      WHERE p.store_id = p_store_id
        AND p.voided = false
        AND p.currency = 'NGN'
        AND p.paid_at >= (v_today - 59)::timestamp AT TIME ZONE v_tz
        AND p.paid_at <= v_now
    ),
    bal AS (
      SELECT b.order_id, b.balance, o.client_id,
             coalesce(o.balance_due_date, o.delivery_date) AS due_date
      FROM public._store_order_balances(p_store_id) b
      JOIN public.orders o ON o.id = b.order_id
      WHERE b.currency = 'NGN' AND b.balance > 0 AND o.status <> 'cancelled'
    ),
    owers AS (
      SELECT bal.client_id,
             sum(bal.balance) AS balance,
             min(bal.due_date) AS earliest_due,
             bool_or(bal.due_date < v_today) AS overdue,
             (array_agg(bal.order_id ORDER BY bal.balance DESC))[1] AS top_order_id
      FROM bal
      GROUP BY bal.client_id
    )
    SELECT jsonb_build_object(
      'today', jsonb_build_object(
        'total', (SELECT coalesce(sum(amount), 0) FROM pay WHERE local_ts::date = v_today),
        'count', (SELECT count(*) FROM pay WHERE local_ts::date = v_today),
        -- Same weekday last week, up to the same time of day.
        'prev_total', (SELECT coalesce(sum(amount), 0) FROM pay
          WHERE local_ts::date = v_today - 7
            AND paid_at <= v_now - interval '7 days'),
        'hourly', (SELECT jsonb_agg(coalesce((
            SELECT sum(amount) FROM pay
            WHERE local_ts::date = v_today AND extract(hour FROM local_ts) = h
          ), 0) ORDER BY h) FROM generate_series(0, 23) h),
        'methods', (SELECT coalesce(jsonb_object_agg(method, total), '{}'::jsonb) FROM (
          SELECT method, sum(amount) AS total FROM pay
          WHERE local_ts::date = v_today GROUP BY method) m)
      ),
      'days', (SELECT jsonb_agg(jsonb_build_object(
          'date', d::date,
          'amount', coalesce((SELECT sum(amount) FROM pay WHERE local_ts::date = d::date), 0)
        ) ORDER BY d)
        FROM generate_series(v_today - 29, v_today, interval '1 day') d),
      'd7', jsonb_build_object(
        'total', (SELECT coalesce(sum(amount), 0) FROM pay WHERE local_ts::date > v_today - 7),
        'prev_total', (SELECT coalesce(sum(amount), 0) FROM pay
          WHERE local_ts::date BETWEEN v_today - 13 AND v_today - 7),
        'methods', (SELECT coalesce(jsonb_object_agg(method, total), '{}'::jsonb) FROM (
          SELECT method, sum(amount) AS total FROM pay
          WHERE local_ts::date > v_today - 7 GROUP BY method) m)
      ),
      'd30', jsonb_build_object(
        'total', (SELECT coalesce(sum(amount), 0) FROM pay WHERE local_ts::date > v_today - 30),
        'prev_total', (SELECT coalesce(sum(amount), 0) FROM pay
          WHERE local_ts::date BETWEEN v_today - 59 AND v_today - 30),
        'methods', (SELECT coalesce(jsonb_object_agg(method, total), '{}'::jsonb) FROM (
          SELECT method, sum(amount) AS total FROM pay
          WHERE local_ts::date > v_today - 30 GROUP BY method) m)
      ),
      'owed', jsonb_build_object(
        'total', (SELECT coalesce(sum(balance), 0) FROM owers),
        'clients', (SELECT count(*) FROM owers),
        'overdue_clients', (SELECT count(*) FROM owers WHERE overdue)
      ),
      'who_owes', (SELECT coalesce(jsonb_agg(jsonb_build_object(
          'client_id', w.client_id,
          'client_name', c.full_name,
          'phone', c.phone,
          'whatsapp_phone', c.whatsapp_phone,
          'consent_whatsapp', c.consent_whatsapp,
          'preferred_language', c.preferred_language,
          'balance', w.balance,
          'earliest_due', w.earliest_due,
          'overdue', coalesce(w.overdue, false),
          'order_id', o.id,
          'garment_type', o.garment_type,
          'tracking_token', o.tracking_token
        ) ORDER BY coalesce(w.overdue, false) DESC, w.earliest_due NULLS LAST, w.balance DESC), '[]'::jsonb)
        FROM (
          SELECT * FROM owers
          ORDER BY coalesce(overdue, false) DESC, earliest_due NULLS LAST, balance DESC
          LIMIT 5
        ) w
        JOIN public.clients c ON c.id = w.client_id
        LEFT JOIN public.orders o ON o.id = w.top_order_id),
      'recent_payments', (SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', r.id,
          'paid_at', r.paid_at,
          'amount', r.amount,
          'currency', r.currency,
          'method', r.method,
          'voided', r.voided,
          'reference', coalesce(r.reference, r.paystack_ref),
          'order_id', r.order_id,
          'order_number', o.number,
          'garment_type', o.garment_type,
          'quantity', o.quantity,
          'client_name', c.full_name,
          'order_balance', b.balance
        ) ORDER BY r.paid_at DESC, r.created_at DESC), '[]'::jsonb)
        FROM (
          SELECT * FROM public.payments
          WHERE store_id = p_store_id
          ORDER BY paid_at DESC, created_at DESC
          LIMIT 6
        ) r
        LEFT JOIN public.orders o ON o.id = r.order_id
        LEFT JOIN public.clients c ON c.id = o.client_id
        LEFT JOIN public._store_order_balances(p_store_id) b ON b.order_id = r.order_id),
      'margin', CASE WHEN v_profit_access THEN (
        SELECT jsonb_build_object(
          'collected', cur.collected,
          'expenses', cur.expenses,
          'profit', cur.collected - cur.expenses,
          'pct', CASE WHEN cur.collected > 0
            THEN round((cur.collected - cur.expenses)::numeric / cur.collected * 100, 1) END,
          'prev_pct', CASE WHEN prev.collected > 0
            THEN round((prev.collected - prev.expenses)::numeric / prev.collected * 100, 1) END
        )
        FROM (
          SELECT
            (SELECT coalesce(sum(p.amount), 0) FROM public.payments p
              WHERE p.store_id = p_store_id AND p.voided = false AND p.currency = 'NGN'
                AND p.paid_at >= v_month_start::timestamp AT TIME ZONE v_tz
                AND p.paid_at <= v_now) AS collected,
            (SELECT coalesce(sum(e.amount), 0) FROM public.expenses e
              WHERE e.store_id = p_store_id
                AND e.spent_at::date BETWEEN v_month_start AND v_today) AS expenses
        ) cur,
        (
          SELECT
            (SELECT coalesce(sum(p.amount), 0) FROM public.payments p
              WHERE p.store_id = p_store_id AND p.voided = false AND p.currency = 'NGN'
                AND p.paid_at >= v_prev_month_start::timestamp AT TIME ZONE v_tz
                AND p.paid_at < (v_prev_month_end + 1)::timestamp AT TIME ZONE v_tz) AS collected,
            (SELECT coalesce(sum(e.amount), 0) FROM public.expenses e
              WHERE e.store_id = p_store_id
                AND e.spent_at::date BETWEEN v_prev_month_start AND v_prev_month_end) AS expenses
        ) prev
      ) END
    ) INTO v_money_json;
  END IF;

  v_result := jsonb_build_object(
    'generated_at', v_now,
    'today', v_today,
    'timezone', v_tz,
    'can_see_money', v_money,
    'access', jsonb_build_object(
      'profit', v_profit_access,
      'fittings', v_fittings_access,
      'inventory', v_inventory_access
    ),
    'work', v_work,
    'fittings', v_fittings,
    'low_stock', v_low_stock,
    'my_jobs', v_my_jobs,
    'money', v_money_json
  );
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_home_dashboard(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_home_dashboard(uuid) TO authenticated;

COMMIT;

-- ============================================================
-- Verification: expect all_true = true and failed_checks empty.
-- ============================================================
SELECT
  bool_and(ok) AS all_true,
  coalesce(array_agg(check_name) FILTER (WHERE NOT ok), ARRAY[]::text[]) AS failed_checks
FROM (
  SELECT 'get_home_dashboard exists' AS check_name,
    EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'get_home_dashboard') AS ok
  UNION ALL
  SELECT 'get_home_dashboard is security definer',
    coalesce((SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'get_home_dashboard'), false)
  UNION ALL
  SELECT 'get_home_dashboard pins search_path',
    coalesce((SELECT 'search_path=public' = ANY(p.proconfig) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'get_home_dashboard'), false)
  UNION ALL
  SELECT 'anon cannot call get_home_dashboard',
    NOT has_function_privilege('anon', 'public.get_home_dashboard(uuid)', 'execute')
  UNION ALL
  SELECT 'authenticated can call get_home_dashboard',
    has_function_privilege('authenticated', 'public.get_home_dashboard(uuid)', 'execute')
  UNION ALL
  SELECT 'balance helper still private',
    NOT has_function_privilege('authenticated', 'public._store_order_balances(uuid)', 'execute')
  UNION ALL
  SELECT 'payments (store_id, paid_at) index exists',
    EXISTS(SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = 'idx_payments_store_paid_at')
  UNION ALL
  SELECT 'orders (store_id, delivery_date) index exists',
    EXISTS(SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = 'idx_orders_store_delivery_date')
) checks;
