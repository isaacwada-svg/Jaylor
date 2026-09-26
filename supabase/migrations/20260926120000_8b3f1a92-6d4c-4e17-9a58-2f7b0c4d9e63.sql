-- Platform-admin ops tooling: cross-store search, billing history, a real
-- (if minimal) error/incident log, and platform + per-store health signals.
-- All read-only RPCs below are gated to any platform admin (super_admin,
-- admin or support can all view); nothing here grants write access.

-- A generic sink for 5xx responses raised by edge functions via the shared
-- errorResponse() helper (supabase/functions/_shared/ai.ts) -- service-role
-- only, written by a raw REST insert from within edge functions themselves.
CREATE TABLE public.platform_error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message text NOT NULL,
  status int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_error_logs_created_at_idx ON public.platform_error_logs (created_at DESC);
ALTER TABLE public.platform_error_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_error_logs FROM anon, authenticated;
GRANT ALL ON public.platform_error_logs TO service_role;

CREATE OR REPLACE FUNCTION public.admin_search(p_query text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q text := trim(coalesce(p_query, ''));
  v_like text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF length(v_q) < 2 THEN
    RETURN jsonb_build_object('stores', '[]'::jsonb, 'clients', '[]'::jsonb, 'orders', '[]'::jsonb, 'payments', '[]'::jsonb);
  END IF;
  v_like := '%' || v_q || '%';

  RETURN jsonb_build_object(
    'stores', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'slug', s.slug, 'city', s.city
      )), '[]'::jsonb)
      FROM (
        SELECT id, name, slug, city FROM public.stores
        WHERE name ILIKE v_like OR slug ILIKE v_like OR city ILIKE v_like
        LIMIT 8
      ) s
    ),
    'clients', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'full_name', c.full_name, 'phone', c.phone,
        'store_id', c.store_id, 'store_name', st.name
      )), '[]'::jsonb)
      FROM (
        SELECT id, full_name, phone, store_id FROM public.clients
        WHERE full_name ILIKE v_like OR phone ILIKE v_like
        LIMIT 8
      ) c
      JOIN public.stores st ON st.id = c.store_id
    ),
    'orders', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id, 'number', o.number, 'garment_type', o.garment_type,
        'store_id', o.store_id, 'store_name', st.name, 'created_at', o.created_at
      )), '[]'::jsonb)
      FROM (
        SELECT id, number, garment_type, store_id, created_at FROM public.orders
        WHERE number ILIKE v_like
        ORDER BY created_at DESC
        LIMIT 8
      ) o
      JOIN public.stores st ON st.id = o.store_id
    ),
    'payments', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'amount', p.amount, 'reference', p.reference,
        'store_id', p.store_id, 'store_name', st.name, 'paid_at', p.paid_at
      )), '[]'::jsonb)
      FROM (
        SELECT id, amount, reference, store_id, paid_at FROM public.payments
        WHERE reference ILIKE v_like OR paystack_ref ILIKE v_like
        ORDER BY paid_at DESC
        LIMIT 8
      ) p
      JOIN public.stores st ON st.id = p.store_id
    )
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_search(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_search(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_billing_history(p_store_id uuid DEFAULT NULL, p_limit int DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN (
    SELECT coalesce(jsonb_agg(row_data ORDER BY event_at DESC), '[]'::jsonb)
    FROM (
      (
        SELECT jsonb_build_object(
          'kind', 'payment', 'store_id', pp.store_id, 'store_name', s.name,
          'plan_code', pp.plan_code, 'amount', pp.amount, 'status', pp.status,
          'reference', pp.reference, 'event_at', coalesce(pp.paid_at, pp.created_at)
        ) AS row_data, coalesce(pp.paid_at, pp.created_at) AS event_at
        FROM public.plan_payments pp
        JOIN public.stores s ON s.id = pp.store_id
        WHERE p_store_id IS NULL OR pp.store_id = p_store_id
        ORDER BY event_at DESC
        LIMIT greatest(1, least(p_limit, 500))
      )
      UNION ALL
      (
        SELECT jsonb_build_object(
          'kind', 'plan_change', 'store_id', sh.store_id, 'store_name', s.name,
          'from_plan', sh.from_plan, 'to_plan', sh.to_plan, 'event_at', sh.changed_at
        ) AS row_data, sh.changed_at AS event_at
        FROM public.subscription_history sh
        JOIN public.stores s ON s.id = sh.store_id
        WHERE p_store_id IS NULL OR sh.store_id = p_store_id
        ORDER BY event_at DESC
        LIMIT greatest(1, least(p_limit, 500))
      )
    ) combined
    LIMIT greatest(1, least(p_limit, 500))
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_billing_history(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_billing_history(uuid, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_recent_errors(p_hours int DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since timestamptz := now() - make_interval(hours => greatest(1, least(p_hours, 24 * 30)));
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN jsonb_build_object(
    'since', v_since,
    'function_errors', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'message', message, 'status', status, 'created_at', created_at
      ) ORDER BY created_at DESC), '[]'::jsonb)
      FROM (
        SELECT id, message, status, created_at FROM public.platform_error_logs
        WHERE created_at >= v_since ORDER BY created_at DESC LIMIT 200
      ) e
    ),
    'webhook_errors', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'event', event, 'processing_error', processing_error, 'received_at', received_at
      ) ORDER BY received_at DESC), '[]'::jsonb)
      FROM (
        SELECT id, event, processing_error, received_at FROM public.whatsapp_webhook_events
        WHERE received_at >= v_since AND processing_error IS NOT NULL
        ORDER BY received_at DESC LIMIT 200
      ) w
    )
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_recent_errors(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_recent_errors(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_platform_health()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN jsonb_build_object(
    'errors_last_hour', (SELECT count(*) FROM public.platform_error_logs WHERE created_at >= now() - interval '1 hour'),
    'errors_last_24h', (SELECT count(*) FROM public.platform_error_logs WHERE created_at >= now() - interval '24 hours'),
    'webhook_total_24h', (SELECT count(*) FROM public.whatsapp_webhook_events WHERE received_at >= now() - interval '24 hours'),
    'webhook_failed_24h', (SELECT count(*) FROM public.whatsapp_webhook_events WHERE received_at >= now() - interval '24 hours' AND processing_error IS NOT NULL),
    'signups_24h', (SELECT count(*) FROM public.stores WHERE created_at >= now() - interval '24 hours'),
    'orders_24h', (SELECT count(*) FROM public.orders WHERE created_at >= now() - interval '24 hours'),
    'payments_24h', (SELECT count(*) FROM public.payments WHERE paid_at >= now() - interval '24 hours' AND NOT voided),
    'active_stores', (SELECT count(*) FROM public.stores WHERE is_active),
    'inactive_stores', (SELECT count(*) FROM public.stores WHERE NOT is_active),
    'last_rls_check', (
      SELECT jsonb_build_object('ok', ok, 'checked_at', checked_at)
      FROM public.rls_drift_checks ORDER BY checked_at DESC LIMIT 1
    )
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_platform_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_platform_health() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_store_health(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN jsonb_build_object(
    'last_order_at', (SELECT max(created_at) FROM public.orders WHERE store_id = p_store_id),
    'last_payment_at', (SELECT max(paid_at) FROM public.payments WHERE store_id = p_store_id AND NOT voided),
    'orders_7d', (SELECT count(*) FROM public.orders WHERE store_id = p_store_id AND created_at >= now() - interval '7 days'),
    'messages_sent_7d', (SELECT count(*) FROM public.messages WHERE store_id = p_store_id AND created_at >= now() - interval '7 days'),
    'messages_failed_7d', (SELECT count(*) FROM public.messages WHERE store_id = p_store_id AND created_at >= now() - interval '7 days' AND status = 'failed')
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_store_health(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_store_health(uuid) TO authenticated;
