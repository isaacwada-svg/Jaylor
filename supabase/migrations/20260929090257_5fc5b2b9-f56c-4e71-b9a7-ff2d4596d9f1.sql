CREATE TABLE public.order_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'file' CHECK (kind IN ('file','voice')),
  path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes integer NOT NULL DEFAULT 0 CHECK (size_bytes >= 0 AND size_bytes <= 10485760),
  duration_seconds integer,
  transcript text,
  transcript_english text,
  language text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_attachments_order_idx ON public.order_attachments(order_id, created_at DESC);
CREATE INDEX order_attachments_store_idx ON public.order_attachments(store_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_attachments TO authenticated;
GRANT ALL ON public.order_attachments TO service_role;
ALTER TABLE public.order_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members manage their shop attachments" ON public.order_attachments
  FOR ALL TO authenticated
  USING (public.is_store_member(store_id))
  WITH CHECK (public.is_store_member(store_id) AND path LIKE store_id::text || '/%');

CREATE TABLE public.voice_transcription_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid,
  seconds integer NOT NULL DEFAULT 0,
  input_tokens integer,
  output_tokens integer,
  est_cost_usd numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX voice_log_store_day_idx ON public.voice_transcription_log(store_id, created_at DESC);
GRANT SELECT ON public.voice_transcription_log TO authenticated;
GRANT ALL ON public.voice_transcription_log TO service_role;
ALTER TABLE public.voice_transcription_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read their shop voice usage" ON public.voice_transcription_log
  FOR SELECT TO authenticated USING (public.is_store_member(store_id));

INSERT INTO public.ai_config(key, value) VALUES
 ('voice_free_daily_per_store','20'),('voice_max_seconds','60'),('attachments_max_per_order','10')
ON CONFLICT (key) DO NOTHING;

CREATE POLICY "Members read shop attachments" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'attachments' AND public.is_store_member(((storage.foldername(name))[1])::uuid));
CREATE POLICY "Members upload shop attachments" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'attachments' AND public.is_store_member(((storage.foldername(name))[1])::uuid));
CREATE POLICY "Members delete shop attachments" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'attachments' AND public.is_store_member(((storage.foldername(name))[1])::uuid));