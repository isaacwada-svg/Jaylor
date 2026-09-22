/** Server-only helpers for customer portal sign-in codes. */
import { sendWhatsAppText } from "@/lib/whatsapp-send.server";

const CODE_TTL_MINUTES = 10;

export async function hashCode(phone: string, code: string): Promise<string> {
  const data = new TextEncoder().encode(`${phone}:${code}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomCode(): string {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(100000 + ((bytes[0] ?? 0) % 900000));
}

/** True when the customer messaged us in the last 24 hours (free-form reply allowed). */
export async function hasOpenWindow(phone: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("whatsapp_contact_windows")
    .select("last_inbound_at")
    .eq("phone", phone)
    .maybeSingle();
  if (!data) return false;
  return Date.now() - new Date(data.last_inbound_at).getTime() < 24 * 60 * 60 * 1000;
}

export async function touchContactWindow(phone: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("whatsapp_contact_windows")
    .upsert(
      { phone, last_inbound_at: new Date().toISOString() },
      { onConflict: "phone" },
    );
}

/** Too many codes for one number in the last hour? */
export async function codeRequestAllowed(phone: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabaseAdmin
    .from("portal_login_codes")
    .select("id", { count: "exact", head: true })
    .eq("phone", phone)
    .gte("created_at", since);
  return (count ?? 0) < 5;
}

/** Create a fresh code and WhatsApp it to the customer. */
export async function issueLoginCode(phone: string): Promise<{ ok: boolean; error?: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (!(await codeRequestAllowed(phone))) {
    return { ok: false, error: "Too many codes requested. Please try again in an hour." };
  }

  const code = randomCode();
  const codeHash = await hashCode(phone, code);
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString();

  // Retire any earlier unused codes for this number.
  await supabaseAdmin
    .from("portal_login_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("phone", phone)
    .is("consumed_at", null);

  const { error: insertError } = await supabaseAdmin
    .from("portal_login_codes")
    .insert({ phone, code_hash: codeHash, expires_at: expiresAt });
  if (insertError) return { ok: false, error: "Could not create a sign-in code" };

  const sent = await sendWhatsAppText(
    phone,
    `${code} is your Jaylor sign-in code. It expires in ${CODE_TTL_MINUTES} minutes. If you did not ask for it, ignore this message.`,
    "portal_login_code",
  );
  if (!sent.ok) return { ok: false, error: "We could not send the code on WhatsApp" };
  return { ok: true };
}
