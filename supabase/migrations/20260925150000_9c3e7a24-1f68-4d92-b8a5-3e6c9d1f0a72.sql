-- Free-preview phone verification for AI Design: proves a visitor actually
-- holds the WhatsApp number they typed before spending image-generation cost
-- on their free preview, without sending them anything (so it costs nothing).
-- They tap a wa.me link with a one-time code pre-filled and hit send; the
-- inbound message itself (received for free under WhatsApp's pricing model,
-- same as every other inbound message this app already receives) is the
-- proof. Touched only by service-role code (server functions + the
-- WhatsApp webhook + the generate-design edge function), so no anon/
-- authenticated grants at all.
CREATE TABLE public.ai_design_phone_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  code text NOT NULL,
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_design_phone_verifications_phone_idx
  ON public.ai_design_phone_verifications (phone);

ALTER TABLE public.ai_design_phone_verifications ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.ai_design_phone_verifications TO service_role;
