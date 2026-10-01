/** Server-only: daily/weekly owner digests and the transfer-received alert.
 *
 * STEP 1.1 found no evidence that Lovable's WhatsApp connector supports Meta
 * template messages (business-initiated, outside the 24h customer window) --
 * only free-form "text" sends, which only work when the recipient messaged
 * first within the last 24 hours. So every send here is the fallback: an
 * in-app notification is always written, email goes out when the owner has
 * an address on file, and WhatsApp is a bonus that only fires when the
 * owner's own number is inside its own 24h window.
 */
import { sendWhatsAppText } from "@/lib/whatsapp-send.server";
import { hasOpenWindow } from "@/lib/portal-login.server";
import type { LanguageCode } from "@/lib/i18n/languages";
import {
  resolveOwnerMessageLanguage,
  buildDailyTextI18n,
  buildWeeklyTextI18n,
  transferAlertTextI18n,
  dailyDigestSubject,
  weeklyDigestSubject,
  transferAlertSubject,
  type DailyDigestData,
  type WeeklyDigestData,
} from "@/lib/digest-i18n";

type DigestRecipients = {
  storeName: string;
  email: string | null;
  whatsappPhone: string | null;
  alertTransferReceived: boolean;
  digestDaily: boolean;
  digestWeekly: boolean;
  language: LanguageCode;
};

async function getRecipients(storeId: string): Promise<DigestRecipients | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: store }, { data: settings }, { data: ownerMembership }] = await Promise.all([
    supabaseAdmin
      .from("stores")
      .select("name, contact_email, whatsapp_phone, language")
      .eq("id", storeId)
      .maybeSingle(),
    supabaseAdmin
      .from("store_settings")
      .select("email, whatsapp_number, alert_transfer_received, digest_daily, digest_weekly")
      .eq("store_id", storeId)
      .maybeSingle(),
    supabaseAdmin
      .from("store_members")
      .select("user_id")
      .eq("store_id", storeId)
      .eq("role", "owner")
      .maybeSingle(),
  ]);
  if (!store) return null;

  let ownerUiLanguage: string | null = null;
  if (ownerMembership?.user_id) {
    const { data: ownerProfile } = await supabaseAdmin
      .from("profiles")
      .select("ui_language")
      .eq("id", ownerMembership.user_id)
      .maybeSingle();
    ownerUiLanguage = ownerProfile?.ui_language ?? null;
  }

  return {
    storeName: store.name ?? "your shop",
    email: settings?.email ?? store.contact_email ?? null,
    whatsappPhone: settings?.whatsapp_number ?? store.whatsapp_phone ?? null,
    alertTransferReceived: settings?.alert_transfer_received ?? true,
    digestDaily: settings?.digest_daily ?? true,
    digestWeekly: settings?.digest_weekly ?? true,
    language: resolveOwnerMessageLanguage(ownerUiLanguage, store.language),
  };
}

async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "Jaylor <alerts@jaylor.app>", to: [to], subject, text }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export type DigestResult = {
  skipped: boolean;
  email: boolean;
  whatsapp: boolean;
  notification: boolean;
};

export async function sendDailyDigest(
  storeId: string,
  opts?: { force?: boolean },
): Promise<DigestResult> {
  const recipients = await getRecipients(storeId);
  if (!recipients) return { skipped: true, email: false, whatsapp: false, notification: false };
  if (!opts?.force && !recipients.digestDaily) {
    return { skipped: true, email: false, whatsapp: false, notification: false };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.rpc("get_daily_digest_data", { p_store_id: storeId });
  const digest = data as unknown as DailyDigestData;
  const text = buildDailyTextI18n(recipients.language, recipients.storeName, digest);

  await supabaseAdmin.rpc("create_notification", {
    p_store_id: storeId,
    p_type: "daily_digest",
    p_message: text.slice(0, 500),
    p_link: "/dashboard",
  });

  const emailSent = recipients.email
    ? await sendEmail(recipients.email, dailyDigestSubject(recipients.language), text)
    : false;
  let whatsappSent = false;
  if (recipients.whatsappPhone && (await hasOpenWindow(recipients.whatsappPhone))) {
    const result = await sendWhatsAppText(
      recipients.whatsappPhone.replace(/\D/g, ""),
      text,
      "daily_digest",
    );
    whatsappSent = result.ok;
  }

  return { skipped: false, email: emailSent, whatsapp: whatsappSent, notification: true };
}

export async function sendWeeklyDigest(
  storeId: string,
  opts?: { force?: boolean },
): Promise<DigestResult> {
  const recipients = await getRecipients(storeId);
  if (!recipients) return { skipped: true, email: false, whatsapp: false, notification: false };
  if (!opts?.force && !recipients.digestWeekly) {
    return { skipped: true, email: false, whatsapp: false, notification: false };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.rpc("get_weekly_digest_data", { p_store_id: storeId });
  const digest = data as unknown as WeeklyDigestData;
  const text = buildWeeklyTextI18n(recipients.language, recipients.storeName, digest);

  await supabaseAdmin.rpc("create_notification", {
    p_store_id: storeId,
    p_type: "weekly_digest",
    p_message: text.slice(0, 500),
    p_link: "/reports",
  });

  const emailSent = recipients.email
    ? await sendEmail(recipients.email, weeklyDigestSubject(recipients.language), text)
    : false;
  let whatsappSent = false;
  if (recipients.whatsappPhone && (await hasOpenWindow(recipients.whatsappPhone))) {
    const result = await sendWhatsAppText(
      recipients.whatsappPhone.replace(/\D/g, ""),
      text,
      "weekly_digest",
    );
    whatsappSent = result.ok;
  }

  return { skipped: false, email: emailSent, whatsapp: whatsappSent, notification: true };
}

/** Owner alert for one incoming transfer that was matched to an order (auto or manual).
 *  In-app notification + email only for now -- no WhatsApp here while STEP 1.2's dedicated
 *  accounts are still being verified in Paystack test mode. */
export async function sendTransferAlert(
  storeId: string,
  orderId: string,
  transferId: string,
): Promise<DigestResult> {
  const recipients = await getRecipients(storeId);
  if (!recipients || !recipients.alertTransferReceived) {
    return { skipped: true, email: false, whatsapp: false, notification: false };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // _store_order_balances(), not order_balances directly: that view's own
  // WHERE clause is has_store_role(store_id, ...), which reads auth.uid(),
  // and this service-role call carries no user JWT -- a direct read has
  // always silently returned no row here, so this alert's "balance owed"
  // figure has always read as 0 regardless of the order's real balance.
  const [{ data: transfer }, { data: order }, { data: balances }] = await Promise.all([
    supabaseAdmin.from("incoming_transfers").select("amount").eq("id", transferId).maybeSingle(),
    supabaseAdmin.from("orders").select("number, client_id").eq("id", orderId).maybeSingle(),
    supabaseAdmin.rpc("_store_order_balances" as never, { p_store_id: storeId } as never),
  ]);
  if (!transfer || !order)
    return { skipped: true, email: false, whatsapp: false, notification: false };
  const balance = (balances as { order_id: string; balance: number }[] | null)?.find(
    (b) => b.order_id === orderId,
  );

  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("full_name")
    .eq("id", order.client_id)
    .maybeSingle();

  const text = transferAlertTextI18n(
    recipients.language,
    transfer.amount,
    client?.full_name ?? "a client",
    order.number,
    balance?.balance ?? 0,
  );

  await supabaseAdmin.rpc("create_notification", {
    p_store_id: storeId,
    p_type: "transfer_received",
    p_message: text,
    p_link: `/orders/${orderId}`,
  });

  const emailSent = recipients.email
    ? await sendEmail(recipients.email, transferAlertSubject(recipients.language), text)
    : false;

  return { skipped: false, email: emailSent, whatsapp: false, notification: true };
}
