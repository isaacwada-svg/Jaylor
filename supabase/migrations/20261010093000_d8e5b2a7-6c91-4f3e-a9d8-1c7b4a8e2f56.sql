-- Feature funnel analytics: lets the platform admin see, per AI feature,
-- how many attempts actually complete versus how many get turned away --
-- specifically by running out of credits or hitting a plan wall -- so a
-- pricing decision (e.g. "is advisor_chat_vision's 6 credits too steep?")
-- can be made from real numbers instead of a guess.
--
-- ai_ledger already records every attempt that got far enough to reserve
-- credits (status charged = completed, refunded = failed after reserving,
-- e.g. a provider error). It never recorded the attempts that got turned
-- away BEFORE a reservation -- insufficient credits, below the feature's
-- min_plan, disabled, etc -- because reserve_ai_credits just returns an
-- error without writing anything. ai_feature_blocks is that missing half:
-- one row per such turn-away, written by the app (see ai-run.server.ts)
-- whenever runAiFeature returns a non-ok, non-refunded result.
--
-- Safe to run more than once: table/index/function creation all use
-- IF NOT EXISTS / CREATE OR REPLACE, and every policy is dropped before
-- recreation.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_feature_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid,
  feature_key text NOT NULL,
  reason text NOT NULL,
  needed_credits integer,
  min_plan text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_feature_blocks_feature_created ON public.ai_feature_blocks(feature_key, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_feature_blocks_store_created ON public.ai_feature_blocks(store_id, created_at DESC);
GRANT SELECT ON public.ai_feature_blocks TO authenticated;
GRANT ALL ON public.ai_feature_blocks TO service_role;
ALTER TABLE public.ai_feature_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read own blocks" ON public.ai_feature_blocks;
CREATE POLICY "members read own blocks" ON public.ai_feature_blocks FOR SELECT TO authenticated
  USING (public.is_store_member(store_id) OR public.is_platform_admin());

-- Per-feature funnel over the trailing p_days: attempts = completed +
-- refunded + in_progress (should be ~0; a reserved row that never resolved)
-- + insufficient_credits + plan_blocked + other_blocked.
CREATE OR REPLACE FUNCTION public.admin_ai_feature_funnel(p_days integer DEFAULT 30) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_since timestamptz := now() - (GREATEST(p_days, 1) || ' days')::interval; r jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT coalesce(jsonb_agg(x ORDER BY x.attempts DESC, x.feature_key), '[]'::jsonb) INTO r
  FROM (
    SELECT
      fc.feature_key, fc.label, fc.credits, fc.min_plan,
      COALESCE(l.charged, 0) AS completed,
      COALESCE(l.refunded, 0) AS refunded,
      COALESCE(l.reserved, 0) AS in_progress,
      COALESCE(b.insufficient_credits, 0) AS insufficient_credits,
      COALESCE(b.plan_blocked, 0) AS plan_blocked,
      COALESCE(b.other_blocked, 0) AS other_blocked,
      COALESCE(l.charged, 0) + COALESCE(l.refunded, 0) + COALESCE(l.reserved, 0)
        + COALESCE(b.insufficient_credits, 0) + COALESCE(b.plan_blocked, 0) + COALESCE(b.other_blocked, 0) AS attempts
    FROM public.ai_feature_costs fc
    LEFT JOIN (
      SELECT feature_key,
        count(*) FILTER (WHERE status = 'charged') AS charged,
        count(*) FILTER (WHERE status = 'refunded') AS refunded,
        count(*) FILTER (WHERE status = 'reserved') AS reserved
      FROM public.ai_ledger WHERE created_at >= v_since GROUP BY feature_key
    ) l ON l.feature_key = fc.feature_key
    LEFT JOIN (
      SELECT feature_key,
        count(*) FILTER (WHERE reason = 'INSUFFICIENT_CREDITS') AS insufficient_credits,
        count(*) FILTER (WHERE reason = 'PLAN') AS plan_blocked,
        count(*) FILTER (WHERE reason NOT IN ('INSUFFICIENT_CREDITS', 'PLAN')) AS other_blocked
      FROM public.ai_feature_blocks WHERE created_at >= v_since GROUP BY feature_key
    ) b ON b.feature_key = fc.feature_key
  ) x;
  RETURN jsonb_build_object('days', p_days, 'since', v_since, 'features', r);
END $$;
REVOKE ALL ON FUNCTION public.admin_ai_feature_funnel(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_ai_feature_funnel(integer) TO authenticated;

COMMIT;

-- ============================================================
-- Verification: expect every row true, failed_checks empty.
-- ============================================================
SELECT
  bool_and(ok) AS all_true,
  coalesce(array_agg(check_name) FILTER (WHERE NOT ok), ARRAY[]::text[]) AS failed_checks
FROM (
  SELECT 'ai_feature_blocks table exists' AS check_name,
    EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ai_feature_blocks') AS ok
  UNION ALL
  SELECT 'ai_feature_blocks has RLS enabled',
    COALESCE((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.ai_feature_blocks'::regclass), false)
  UNION ALL
  SELECT 'members read own blocks policy exists',
    EXISTS(SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_feature_blocks' AND policyname = 'members read own blocks')
  UNION ALL
  SELECT 'admin_ai_feature_funnel function exists',
    EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'admin_ai_feature_funnel')
) checks;
