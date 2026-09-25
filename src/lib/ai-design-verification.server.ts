/** Server-only helpers for AI Design's free-preview phone verification. */

const CODE_TTL_MINUTES = 30;
const CODE_PATTERN = /^JAYLOR-\d{6}$/;

function randomCode(): string {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  const n = 100000 + ((bytes[0] ?? 0) % 900000);
  return `JAYLOR-${n}`;
}

/** Creates a fresh one-time code for this phone. The caller texts it in themselves — nothing is sent. */
export async function issueAiDesignVerificationCode(phone: string): Promise<{ code: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const code = randomCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString();
  const { error } = await supabaseAdmin
    .from("ai_design_phone_verifications")
    .insert({ phone, code, expires_at: expiresAt });
  if (error) throw new Error("Could not start verification");
  return { code };
}

export async function isPhoneVerifiedForAiDesign(phone: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("ai_design_phone_verifications")
    .select("id")
    .eq("phone", phone)
    .not("verified_at", "is", null)
    .limit(1)
    .maybeSingle();
  return !!data;
}

/**
 * Called from the WhatsApp webhook for every inbound text message. Matches
 * the message body against a pending code for that sender; harmless no-op
 * for every ordinary message that isn't one of these codes.
 */
export async function tryConsumeAiDesignVerification(
  phone: string,
  messageBody: string,
): Promise<boolean> {
  const candidate = messageBody.trim().toUpperCase();
  if (!CODE_PATTERN.test(candidate)) return false;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row } = await supabaseAdmin
    .from("ai_design_phone_verifications")
    .select("id, expires_at")
    .eq("phone", phone)
    .eq("code", candidate)
    .is("verified_at", null)
    .maybeSingle();
  if (!row) return false;
  if (new Date(row.expires_at).getTime() < Date.now()) return false;

  await supabaseAdmin
    .from("ai_design_phone_verifications")
    .update({ verified_at: new Date().toISOString() })
    .eq("id", row.id);
  return true;
}
