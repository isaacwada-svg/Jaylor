/** Server-only WhatsApp sending through the Lovable connector gateway. */

const GATEWAY_URL = "https://connector-gateway.lovable.dev/whatsapp";

export type SendResult =
  | { ok: true; messageId: string | null }
  | { ok: false; error: string; status: number };

/** Send a free-form WhatsApp text. Only valid inside the 24h customer window. */
export async function sendWhatsAppText(
  toDigits: string,
  body: string,
  purpose: string,
): Promise<SendResult> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const whatsappKey = process.env["WHATSAPP_API_KEY"];
  if (!lovableKey || !whatsappKey) {
    return { ok: false, error: "WhatsApp is not configured", status: 500 };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let response: Response;
  try {
    response = await fetch(`${GATEWAY_URL}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": whatsappKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toDigits,
        type: "text",
        text: { body },
      }),
    });
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : "Network error";
    await supabaseAdmin
      .from("whatsapp_outbound_messages")
      .insert({ to_phone: toDigits, purpose, status: "failed", error });
    return { ok: false, error, status: 502 };
  }

  const text = await response.text();
  if (!response.ok) {
    console.error(`WhatsApp send failed [${response.status}]: ${text}`);
    await supabaseAdmin
      .from("whatsapp_outbound_messages")
      .insert({ to_phone: toDigits, purpose, status: "failed", error: text.slice(0, 2000) });
    return { ok: false, error: text, status: response.status };
  }

  let messageId: string | null = null;
  try {
    const parsed = JSON.parse(text) as { messages?: Array<{ id?: string }> };
    messageId = parsed.messages?.[0]?.id ?? null;
  } catch {
    messageId = null;
  }

  await supabaseAdmin
    .from("whatsapp_outbound_messages")
    .insert({ wa_message_id: messageId, to_phone: toDigits, purpose, status: "accepted" });

  // A status callback may already have landed before this row existed.
  if (messageId) await reconcilePendingStatuses(messageId);

  return { ok: true, messageId };
}

const STATUS_RANK: Record<string, number> = {
  accepted: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4,
};

/** Apply the newest status we know for a message id, never moving backwards. */
export async function applyMessageStatus(
  messageId: string,
  status: string,
  error: string | null,
): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row } = await supabaseAdmin
    .from("whatsapp_outbound_messages")
    .select("id, status")
    .eq("wa_message_id", messageId)
    .maybeSingle();
  if (!row) return false;
  const current = STATUS_RANK[row.status] ?? 0;
  const next = STATUS_RANK[status] ?? 0;
  if (next < current) return true;
  await supabaseAdmin
    .from("whatsapp_outbound_messages")
    .update({ status, error, updated_at: new Date().toISOString() })
    .eq("id", row.id);
  return true;
}

/** Statuses stored before their outbound row existed get applied here. */
async function reconcilePendingStatuses(messageId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: events } = await supabaseAdmin
    .from("whatsapp_webhook_events")
    .select("id, payload")
    .eq("event", "whatsapp.status")
    .is("processed_at", null)
    .order("received_at", { ascending: true })
    .limit(50);
  for (const event of events ?? []) {
    const statuses = extractStatuses(event.payload);
    let matched = false;
    for (const status of statuses) {
      if (status.id !== messageId) continue;
      matched = true;
      await applyMessageStatus(status.id, status.status, status.error);
    }
    if (matched && statuses.every((s) => s.id === messageId)) {
      await supabaseAdmin
        .from("whatsapp_webhook_events")
        .update({ processed_at: new Date().toISOString(), processing_error: null })
        .eq("id", event.id);
    }
  }
}

export type StatusUpdate = { id: string; status: string; error: string | null };

export function extractStatuses(payload: unknown): StatusUpdate[] {
  const value = (payload as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          statuses?: Array<{
            id?: string;
            status?: string;
            errors?: Array<{ title?: string; message?: string }>;
          }>;
        };
      }>;
    }>;
  })?.entry?.[0]?.changes?.[0]?.value;
  return (value?.statuses ?? [])
    .filter((s): s is { id: string; status: string; errors?: Array<{ title?: string; message?: string }> } =>
      Boolean(s.id && s.status),
    )
    .map((s) => ({
      id: s.id,
      status: s.status,
      error: s.errors?.[0] ? (s.errors[0].message ?? s.errors[0].title ?? null) : null,
    }));
}
