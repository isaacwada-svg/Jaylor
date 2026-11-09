-- Ask Jaylor with voice, photos and files: a new private storage bucket for
-- attachments (images, PDFs), a column to remember which attachments belong
-- to which message (so the daily cleanup job knows what to delete), two new
-- wallet-gated feature keys (voice transcription, image/file analysis -- both
-- priced above a plain text question), and a daily cron job that deletes
-- attachments older than 30 days via the app's own cleanup route (storage
-- objects can only be removed through the Storage API, not a raw SQL
-- DELETE, so this follows the same pg_cron -> net.http_post -> TanStack API
-- route pattern the daily/weekly digest already uses -- same shared secret,
-- no new one needed).
--
-- Safe to run more than once: the bucket insert and feature-cost inserts are
-- ON CONFLICT DO NOTHING, the column add is IF NOT EXISTS, every storage
-- policy is dropped before recreation, and the cron block unschedules
-- before rescheduling (the same guard every other cron job in this project
-- uses).

BEGIN;

-- 1. Private bucket for Ask Jaylor attachments. Same posture as
--    order-style-photos/order-progress-photos/order-materials: members-only,
--    scoped per store folder, 10MB per file enforced at the bucket level as
--    a second line of defense behind the client-side check.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ask-jaylor-uploads',
  'ask-jaylor-uploads',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS ask_jaylor_uploads_member_read ON storage.objects;
CREATE POLICY ask_jaylor_uploads_member_read
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'ask-jaylor-uploads'
    AND is_store_member((split_part(name, '/', 1))::uuid)
  );

DROP POLICY IF EXISTS ask_jaylor_uploads_member_insert ON storage.objects;
CREATE POLICY ask_jaylor_uploads_member_insert
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'ask-jaylor-uploads'
    AND is_store_member((split_part(name, '/', 1))::uuid)
  );

-- No client DELETE policy -- removal only happens through the 30-day
-- cleanup job below, which runs as service_role (bypasses RLS entirely).

-- 2. Which attachments (if any) a message carried, so the cleanup job can
--    find them by the message's own created_at and clear the reference once
--    the underlying files are gone. Each element: {path, mimeType, name}.
ALTER TABLE public.advisor_messages ADD COLUMN IF NOT EXISTS attachments jsonb;

-- 3. Two new wallet-gated feature keys, both priced above advisor_chat's
--    plain-text 2 credits to reflect their real (still tiny) extra Gemini
--    cost -- see the PR description for the per-call cost/margin math.
INSERT INTO public.ai_feature_costs (feature_key, label, credits, model_key, min_plan) VALUES
  ('voice_transcribe', 'Voice question transcription', 3, 'model_text', 'free'),
  ('advisor_chat_vision', 'Ask Jaylor with photos or files', 6, 'model_text', 'free')
ON CONFLICT (feature_key) DO NOTHING;

-- 4. Daily cleanup: deletes attachments (and clears the reference) for any
--    message older than 30 days that still has attachments recorded.
--    Scheduled here against the jaylor_internal_api_secret Vault secret,
--    same as the daily/weekly digest cron originally was -- but that secret
--    was never actually created in this database, so this job is rescheduled
--    for real in the very next migration, which copies the live secret
--    straight off the (now working) digest job instead. Update the
--    hardcoded https://jaylor.com.ng URL below if that is not this
--    project's production domain.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'supabase_vault') THEN
    PERFORM cron.unschedule('ask-jaylor-cleanup-daily')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ask-jaylor-cleanup-daily');
    PERFORM cron.schedule(
      'ask-jaylor-cleanup-daily',
      '0 5 * * *',
      $cron$
        SELECT net.http_post(
          url := 'https://jaylor.com.ng/api/cron/ask-jaylor-cleanup',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'X-Internal-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'jaylor_internal_api_secret')
          ),
          body := '{}'::jsonb
        );
      $cron$
    );
  END IF;
END;
$$;

COMMIT;

-- ============================================================
-- Verification: expect every row true, failed_checks empty.
-- ============================================================
SELECT
  bool_and(ok) AS all_true,
  coalesce(array_agg(check_name) FILTER (WHERE NOT ok), ARRAY[]::text[]) AS failed_checks
FROM (
  SELECT 'ask-jaylor-uploads bucket exists' AS check_name,
    EXISTS(SELECT 1 FROM storage.buckets WHERE id = 'ask-jaylor-uploads') AS ok
  UNION ALL
  SELECT 'ask-jaylor-uploads bucket is private',
    (SELECT public = false FROM storage.buckets WHERE id = 'ask-jaylor-uploads')
  UNION ALL
  SELECT 'ask_jaylor_uploads_member_read policy exists',
    EXISTS(SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'ask_jaylor_uploads_member_read')
  UNION ALL
  SELECT 'ask_jaylor_uploads_member_insert policy exists',
    EXISTS(SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'ask_jaylor_uploads_member_insert')
  UNION ALL
  SELECT 'advisor_messages.attachments exists',
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'advisor_messages' AND column_name = 'attachments')
  UNION ALL
  SELECT 'voice_transcribe feature cost exists',
    EXISTS(SELECT 1 FROM public.ai_feature_costs WHERE feature_key = 'voice_transcribe')
  UNION ALL
  SELECT 'advisor_chat_vision feature cost exists',
    EXISTS(SELECT 1 FROM public.ai_feature_costs WHERE feature_key = 'advisor_chat_vision')
  UNION ALL
  SELECT 'ask-jaylor-cleanup-daily cron job exists (only if pg_cron is installed)', (
    NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
    OR EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ask-jaylor-cleanup-daily')
  )
) checks;
