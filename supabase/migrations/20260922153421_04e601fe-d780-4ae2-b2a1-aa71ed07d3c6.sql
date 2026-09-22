CREATE TABLE public.whatsapp_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id text NOT NULL UNIQUE,
  event text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_error text
);
GRANT ALL ON public.whatsapp_webhook_events TO service_role;
ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.whatsapp_outbound_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_message_id text UNIQUE,
  to_phone text NOT NULL,
  purpose text NOT NULL,
  status text NOT NULL DEFAULT 'accepted',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.whatsapp_outbound_messages TO service_role;
ALTER TABLE public.whatsapp_outbound_messages ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.whatsapp_contact_windows (
  phone text PRIMARY KEY,
  last_inbound_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.whatsapp_contact_windows TO service_role;
ALTER TABLE public.whatsapp_contact_windows ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.portal_login_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX portal_login_codes_phone_idx ON public.portal_login_codes (phone, created_at DESC);
GRANT ALL ON public.portal_login_codes TO service_role;
ALTER TABLE public.portal_login_codes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.portal_sessions (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days',
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX portal_sessions_phone_idx ON public.portal_sessions (phone);
GRANT ALL ON public.portal_sessions TO service_role;
ALTER TABLE public.portal_sessions ENABLE ROW LEVEL SECURITY;