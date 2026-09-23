-- Jaylor Business Advisor: conversation storage + monthly message allowance.
-- The first 30 days after a store is created get generous/unlimited advisor
-- access on the cheap model (enforced in the edge function via the store's
-- created_at, not tracked here); from day 31 onward the plan's permanent
-- monthly allowance below applies, tracked the same way every other
-- per-plan feature limit is (feature_usage_counters + check_feature_limit).

CREATE TABLE public.advisor_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New conversation',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX advisor_threads_store_id_idx ON public.advisor_threads (store_id, updated_at DESC);

ALTER TABLE public.advisor_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY advisor_threads_owner_manager_select
  ON public.advisor_threads FOR SELECT TO authenticated
  USING (has_store_role(store_id, ARRAY['owner'::store_role, 'manager'::store_role]));

CREATE POLICY advisor_threads_owner_manager_insert
  ON public.advisor_threads FOR INSERT TO authenticated
  WITH CHECK (has_store_role(store_id, ARRAY['owner'::store_role, 'manager'::store_role]));

CREATE POLICY advisor_threads_owner_manager_update
  ON public.advisor_threads FOR UPDATE TO authenticated
  USING (has_store_role(store_id, ARRAY['owner'::store_role, 'manager'::store_role]))
  WITH CHECK (has_store_role(store_id, ARRAY['owner'::store_role, 'manager'::store_role]));

CREATE POLICY advisor_threads_owner_manager_delete
  ON public.advisor_threads FOR DELETE TO authenticated
  USING (has_store_role(store_id, ARRAY['owner'::store_role, 'manager'::store_role]));

REVOKE ALL ON public.advisor_threads FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.advisor_threads TO authenticated;
GRANT ALL ON public.advisor_threads TO service_role;

CREATE TABLE public.advisor_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.advisor_threads(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX advisor_messages_thread_id_idx ON public.advisor_messages (thread_id, created_at);

ALTER TABLE public.advisor_messages ENABLE ROW LEVEL SECURITY;

-- Only the advisor-chat edge function (service_role) writes messages, after
-- validating the request and getting a real model response -- this keeps
-- "only completed user and assistant messages get persisted" (never a user
-- message that was rejected by the quota/rate-limit gate) as an invariant
-- the client can't bypass. Authenticated only ever reads.
CREATE POLICY advisor_messages_owner_manager_select
  ON public.advisor_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.advisor_threads t
      WHERE t.id = advisor_messages.thread_id
        AND has_store_role(t.store_id, ARRAY['owner'::store_role, 'manager'::store_role])
    )
  );

REVOKE ALL ON public.advisor_messages FROM PUBLIC, anon;
GRANT SELECT ON public.advisor_messages TO authenticated;
GRANT ALL ON public.advisor_messages TO service_role;

-- Permanent post-trial monthly allowance per plan. Free never drops to zero;
-- growth gets a meaningfully higher cap; business/custom are unlimited
-- (a null limit already means "always allowed" in check_feature_limit).
UPDATE public.plans SET limits = limits || jsonb_build_object('advisor_messages', 8) WHERE code = 'free';
UPDATE public.plans SET limits = limits || jsonb_build_object('advisor_messages', 120) WHERE code = 'growth';
UPDATE public.plans SET limits = limits || jsonb_build_object('advisor_messages', null) WHERE code IN ('business', 'custom');

-- Records one advisor message against the calling store's monthly
-- allowance. Only called post-trial (trial messages don't consume the
-- permanent allowance) and only from the advisor-chat edge function.
CREATE OR REPLACE FUNCTION public.increment_advisor_usage(p_store_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.feature_usage_counters (store_id, feature_key, period_month, used)
  VALUES (p_store_id, 'advisor_messages', date_trunc('month', now())::date, 1)
  ON CONFLICT (store_id, feature_key, period_month)
  DO UPDATE SET used = feature_usage_counters.used + 1, updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.increment_advisor_usage(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_advisor_usage(uuid) TO service_role;
