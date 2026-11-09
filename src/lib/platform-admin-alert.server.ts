/** Server-only: emails the platform admin (PLATFORM_ADMIN_EMAIL) for events
 *  that need attention outside the admin dashboard -- a new signup, or a
 *  payment/security-relevant event. Best-effort: never throws, since none
 *  of these alerts should ever block the event that triggered them. */
import { sendTemplateEmail } from "@/lib/email-templates/send-email";

export type PlatformAlertKind =
  "signup" | "webhook_signature_invalid" | "dedicated_account_failed" | "rls_drift";

// A misconfigured Paystack secret would fail signature verification on
// every real webhook delivery, not just attacks -- without a throttle that
// floods the admin inbox once per payment. Signups and RLS drift are
// naturally rare (one per store, one per week) and always worth a separate
// email, so only the two events that can repeat in a tight loop are capped.
const THROTTLE_MINUTES: Partial<Record<PlatformAlertKind, number>> = {
  webhook_signature_invalid: 30,
  dedicated_account_failed: 30,
};

async function claimThrottle(kind: PlatformAlertKind): Promise<boolean> {
  const minutes = THROTTLE_MINUTES[kind];
  if (!minutes) return true;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const bucket = Math.floor(Date.now() / (minutes * 60 * 1000));
  const key = `platform_alert_throttle_${kind}_${bucket}`;
  const { data: existing } = await supabaseAdmin
    .from("app_settings")
    .select("key")
    .eq("key", key)
    .maybeSingle();
  if (existing) return false;

  const { error } = await supabaseAdmin
    .from("app_settings")
    .insert({ key, value: new Date().toISOString() });
  return !error;
}

type PlatformAlertDetails = Record<string, string | number | null | undefined>;

function formatAlert(
  kind: PlatformAlertKind,
  details: PlatformAlertDetails,
): { subject: string; body: string } {
  const lines = Object.entries(details)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  switch (kind) {
    case "signup":
      return {
        subject: `New signup: ${details["storeName"] ?? "a store"}`,
        body: `A new store signed up.\n\n${lines}`,
      };
    case "webhook_signature_invalid":
      return {
        subject: "Paystack webhook: invalid signature",
        body: `A request to the Paystack webhook endpoint failed signature verification. This can mean someone is probing the endpoint, or the webhook secret is misconfigured.\n\n${lines}`,
      };
    case "dedicated_account_failed":
      return {
        subject: "Dedicated account assignment failed",
        body: `Paystack failed to assign a dedicated virtual account for a store.\n\n${lines}`,
      };
    case "rls_drift":
      return {
        subject: "RLS drift check failed",
        body: `The weekly row-level-security drift check found a problem. Check the admin platform health screen for the full report.\n\n${lines}`,
      };
  }
}

/** Returns true if the email was sent. Never throws. */
export async function notifyPlatformAdmin(
  kind: PlatformAlertKind,
  details: PlatformAlertDetails = {},
): Promise<boolean> {
  try {
    const adminEmail = process.env["PLATFORM_ADMIN_EMAIL"];
    if (!adminEmail) return false;
    if (!(await claimThrottle(kind))) return false;

    const { subject, body } = formatAlert(kind, details);
    const result = await sendTemplateEmail("platform-admin-alert", adminEmail, {
      templateData: { subject, body },
    });
    return result.sent;
  } catch (error) {
    console.error(`[platform-admin-alert] '${kind}' failed:`, error);
    return false;
  }
}
