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
import { formatMoney } from "@/lib/jaylor";

type DigestRecipients = {
  storeName: string;
  email: string | null;
  whatsappPhone: string | null;
  alertTransferReceived: boolean;
  digestDaily: boolean;
  digestWeekly: boolean;
};

async function getRecipients(storeId: string): Promise<DigestRecipients | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: store }, { data: settings }] = await Promise.all([
    supabaseAdmin
      .from("stores")
      .select("name, contact_email, whatsapp_phone")
      .eq("id", storeId)
      .maybeSingle(),
    supabaseAdmin
      .from("store_settings")
      .select("email, whatsapp_number, alert_transfer_received, digest_daily, digest_weekly")
      .eq("store_id", storeId)
      .maybeSingle(),
  ]);
  if (!store) return null;
  return {
    storeName: store.name ?? "your shop",
    email: settings?.email ?? store.contact_email ?? null,
    whatsappPhone: settings?.whatsapp_number ?? store.whatsapp_phone ?? null,
    alertTransferReceived: settings?.alert_transfer_received ?? true,
    digestDaily: settings?.digest_daily ?? true,
    digestWeekly: settings?.digest_weekly ?? true,
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

type OrderRef = { order_id: string; number: string; garment_type: string; client_name: string };
type DailyDigestData = {
  due_today: OrderRef[];
  due_next_3_days: (OrderRef & { delivery_date: string })[];
  overdue: (OrderRef & { delivery_date: string })[];
  outstanding_total: number;
  top_balances: { client_name: string; balance: number; number: string }[];
};
type WeeklyDigestData = {
  new_orders: number;
  billed: number;
  collected: number;
  outstanding_total: number;
  overdue_count: number;
  garments_due_this_week: number;
};

function buildDailyText(storeName: string, d: DailyDigestData): string {
  const lines = [`Good morning from Jaylor — ${storeName}'s daily digest.`];
  lines.push(
    d.due_today.length > 0
      ? `Due today (${d.due_today.length}): ${d.due_today.map((o) => `${o.client_name} (${o.number})`).join(", ")}`
      : "Nothing due today.",
  );
  if (d.due_next_3_days.length > 0) {
    lines.push(
      `Due in the next 3 days (${d.due_next_3_days.length}): ${d.due_next_3_days.map((o) => `${o.client_name} (${o.number})`).join(", ")}`,
    );
  }
  if (d.overdue.length > 0) {
    lines.push(
      `Overdue (${d.overdue.length}): ${d.overdue.map((o) => `${o.client_name} (${o.number})`).join(", ")}`,
    );
  }
  lines.push(`Total outstanding: ${formatMoney(d.outstanding_total)}`);
  if (d.top_balances.length > 0) {
    lines.push(
      `Top balances to chase: ${d.top_balances.map((b) => `${b.client_name} ${formatMoney(b.balance)}`).join(", ")}`,
    );
  }
  return lines.join("\n");
}

function buildWeeklyText(storeName: string, d: WeeklyDigestData): string {
  return [
    `${storeName}'s weekly digest.`,
    `New orders: ${d.new_orders} · Billed: ${formatMoney(d.billed)} · Collected: ${formatMoney(d.collected)}`,
    `Outstanding: ${formatMoney(d.outstanding_total)} · Overdue orders: ${d.overdue_count}`,
    `Garments due this week: ${d.garments_due_this_week}`,
  ].join("\n");
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
  const text = buildDailyText(recipients.storeName, digest);

  await supabaseAdmin.rpc("create_notification", {
    p_store_id: storeId,
    p_type: "daily_digest",
    p_message: text.slice(0, 500),
    p_link: "/dashboard",
  });

  const emailSent = recipients.email
    ? await sendEmail(recipients.email, "Your Jaylor daily digest", text)
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
  const text = buildWeeklyText(recipients.storeName, digest);

  await supabaseAdmin.rpc("create_notification", {
    p_store_id: storeId,
    p_type: "weekly_digest",
    p_message: text.slice(0, 500),
    p_link: "/reports",
  });

  const emailSent = recipients.email
    ? await sendEmail(recipients.email, "Your Jaylor weekly digest", text)
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
  const [{ data: transfer }, { data: order }, { data: balance }] = await Promise.all([
    supabaseAdmin.from("incoming_transfers").select("amount").eq("id", transferId).maybeSingle(),
    supabaseAdmin.from("orders").select("number, client_id").eq("id", orderId).maybeSingle(),
    supabaseAdmin.from("order_balances").select("balance").eq("order_id", orderId).maybeSingle(),
  ]);
  if (!transfer || !order)
    return { skipped: true, email: false, whatsapp: false, notification: false };

  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("full_name")
    .eq("id", order.client_id)
    .maybeSingle();

  const text = `Transfer received: ${formatMoney(transfer.amount)} from ${client?.full_name ?? "a client"} for order ${order.number}. New balance: ${formatMoney(balance?.balance ?? 0)}.`;

  await supabaseAdmin.rpc("create_notification", {
    p_store_id: storeId,
    p_type: "transfer_received",
    p_message: text,
    p_link: `/orders/${orderId}`,
  });

  const emailSent = recipients.email
    ? await sendEmail(recipients.email, "Jaylor: transfer received", text)
    : false;

  return { skipped: false, email: emailSent, whatsapp: false, notification: true };
}
