-- Owner alerts and digests.
--
-- STEP 1.1 found no evidence of Meta WhatsApp *template* message support
-- anywhere in the Lovable connector packages or gateway usage code in this
-- repo (only free-form "text" messages, which only work inside a client's
-- 24h contact window -- see src/lib/whatsapp-send.server.ts). So this ships
-- the fallback path: in-app notifications (always) + email via Resend +
-- a dashboard "Today" card, with WhatsApp sent as a bonus only when the
-- *owner's own* number is inside its own 24h window (e.g. they recently
-- messaged the shop's WhatsApp number themselves).
--
-- Reuses store_settings.email / store_settings.whatsapp_number, which exist
-- in the schema already but are unused by any UI yet -- these become the
-- alert/digest recipients (falling back to stores.contact_email /
-- stores.whatsapp_phone when unset).

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS alert_transfer_received boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS digest_daily boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS digest_weekly boolean NOT NULL DEFAULT true;

-- match_incoming_transfer now reports back which order (if any) it matched,
-- so the webhook can fire the "transfer received" owner alert. Return type
-- is changing (void -> uuid), so this must be dropped and recreated, not
-- just replaced.
DROP FUNCTION IF EXISTS public.match_incoming_transfer(uuid);

CREATE FUNCTION public.match_incoming_transfer(p_transfer_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer public.incoming_transfers%ROWTYPE;
  v_order_id uuid;
  v_count int;
BEGIN
  SELECT * INTO v_transfer FROM public.incoming_transfers WHERE id = p_transfer_id;
  IF NOT FOUND OR v_transfer.status <> 'unmatched' THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.order_balances b
  JOIN public.orders o ON o.id = b.order_id
  JOIN public.clients c ON c.id = o.client_id
  WHERE b.store_id = v_transfer.store_id
    AND o.status <> 'cancelled'
    AND b.balance = v_transfer.amount
    AND public.name_similarity(v_transfer.sender_name, c.full_name) >= 0.34;

  IF v_count = 1 THEN
    SELECT o.id INTO v_order_id
    FROM public.order_balances b
    JOIN public.orders o ON o.id = b.order_id
    JOIN public.clients c ON c.id = o.client_id
    WHERE b.store_id = v_transfer.store_id
      AND o.status <> 'cancelled'
      AND b.balance = v_transfer.amount
      AND public.name_similarity(v_transfer.sender_name, c.full_name) >= 0.34
    ORDER BY o.created_at DESC
    LIMIT 1;

    INSERT INTO public.payments (store_id, order_id, amount, method, reference, paid_at)
    VALUES (v_transfer.store_id, v_order_id, v_transfer.amount, 'transfer', v_transfer.paystack_ref, v_transfer.received_at);

    UPDATE public.incoming_transfers
    SET status = 'matched', matched_order_id = v_order_id
    WHERE id = p_transfer_id;

    RETURN v_order_id;
  END IF;

  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.match_incoming_transfer(uuid) FROM PUBLIC, anon, authenticated;

-- Backing data for both the daily digest email/WhatsApp text and the
-- dashboard's "Today" card, so the numbers shown in both places always
-- agree. Callable by a signed-in owner/manager (dashboard) or by the
-- service role (the digest sender, which has no auth.uid() of its own).
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

  RETURN jsonb_build_object(
    'due_today', v_due_today,
    'due_next_3_days', v_due_next3,
    'overdue', v_overdue,
    'outstanding_total', v_outstanding,
    'top_balances', v_top3
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_daily_digest_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_daily_digest_data(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_weekly_digest_data(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_orders int;
  v_billed numeric;
  v_collected numeric;
  v_outstanding numeric;
  v_overdue_count int;
  v_garments_due numeric;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.has_store_role(p_store_id, ARRAY['owner'::store_role, 'manager'::store_role]) THEN
    RAISE EXCEPTION 'You do not have permission to do this' USING ERRCODE = 'P0103';
  END IF;

  SELECT count(*), coalesce(sum(price), 0) INTO v_new_orders, v_billed
  FROM public.orders WHERE store_id = p_store_id AND created_at >= now() - interval '7 days';

  SELECT coalesce(sum(amount), 0) INTO v_collected
  FROM public.payments
  WHERE store_id = p_store_id AND voided = false AND paid_at >= now() - interval '7 days';

  SELECT coalesce(sum(balance), 0) INTO v_outstanding
  FROM public.order_balances WHERE store_id = p_store_id;

  SELECT count(*) INTO v_overdue_count
  FROM public.orders
  WHERE store_id = p_store_id AND status NOT IN ('collected', 'cancelled')
    AND delivery_date::date < current_date;

  SELECT coalesce(sum(quantity), 0) INTO v_garments_due
  FROM public.orders
  WHERE store_id = p_store_id AND status NOT IN ('collected', 'cancelled')
    AND delivery_date::date BETWEEN current_date AND current_date + 6;

  RETURN jsonb_build_object(
    'new_orders', v_new_orders,
    'billed', v_billed,
    'collected', v_collected,
    'outstanding_total', v_outstanding,
    'overdue_count', v_overdue_count,
    'garments_due_this_week', v_garments_due
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_weekly_digest_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_weekly_digest_data(uuid) TO authenticated, service_role;

-- Daily 8am and weekly Monday 8am, Africa/Lagos (UTC+1, no DST) = 07:00 UTC.
-- Calls the app's own /api/cron/digest route (Node/TanStack, not a Supabase
-- edge function -- see that route's own comment for why), authenticated
-- with a shared secret stored in Vault. Same no-op-if-unavailable guard
-- used elsewhere in this project for pg_cron/pg_net.
--
-- Before this job can actually run, add the secret once via the Supabase
-- SQL editor:
--   select vault.create_secret('<a long random string>', 'jaylor_internal_api_secret');
-- and set the same string as the INTERNAL_API_SECRET env var on the Node
-- app. Also update the hardcoded https://jaylor.com.ng URL below if that is
-- not this project's production domain.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'supabase_vault') THEN
    PERFORM cron.unschedule('jaylor-daily-digest')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'jaylor-daily-digest');
    PERFORM cron.schedule(
      'jaylor-daily-digest',
      '0 7 * * *',
      $cron$
        SELECT net.http_post(
          url := 'https://jaylor.com.ng/api/cron/digest',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'X-Internal-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'jaylor_internal_api_secret')
          ),
          body := jsonb_build_object('kind', 'daily')
        );
      $cron$
    );

    PERFORM cron.unschedule('jaylor-weekly-digest')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'jaylor-weekly-digest');
    PERFORM cron.schedule(
      'jaylor-weekly-digest',
      '0 7 * * 1',
      $cron$
        SELECT net.http_post(
          url := 'https://jaylor.com.ng/api/cron/digest',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'X-Internal-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'jaylor_internal_api_secret')
          ),
          body := jsonb_build_object('kind', 'weekly')
        );
      $cron$
    );
  END IF;
END;
$$;
