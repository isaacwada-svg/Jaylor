import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isValidWebhookSignature } from "../_shared/paystack.ts";

// Configure this URL as the webhook endpoint in your Paystack dashboard.
// Belt-and-suspenders alongside verify-design-payment: covers the case where
// the customer closes the tab before returning from Paystack's checkout.
// Also handles Dedicated Virtual Account events (dedicatedaccount.assign.*
// and charge.success with channel "dedicated_nuban") for shops that have set
// up a business account number -- see create-dedicated-account.

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature");

  let valid: boolean;
  try {
    valid = await isValidWebhookSignature(rawBody, signature);
  } catch {
    return new Response("Not configured", { status: 500 });
  }
  if (!valid) return new Response("Invalid signature", { status: 401 });

  const event = JSON.parse(rawBody);
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (event.event === "dedicatedaccount.assign.success") {
    await handleDedicatedAccountAssigned(supabase, event.data ?? {});
    return new Response("ok", { status: 200 });
  }
  if (event.event === "dedicatedaccount.assign.failed") {
    await handleDedicatedAccountFailed(supabase, event.data ?? {});
    return new Response("ok", { status: 200 });
  }

  if (event.event !== "charge.success") {
    return new Response("ignored", { status: 200 });
  }

  if (event.data?.channel === "dedicated_nuban") {
    await handleIncomingTransfer(supabase, event.data);
    return new Response("ok", { status: 200 });
  }

  const reference = event.data?.reference;
  if (!reference) return new Response("ok", { status: 200 });

  if (reference.startsWith("plan_")) {
    await activatePlan(supabase, reference, Number(event.data?.amount ?? 0));
  } else if (reference.startsWith("aicredit_")) {
    // AI credit top-up: idempotent by reference, amount-checked in the database.
    await supabase.rpc("apply_ai_topup", {
      p_reference: reference,
      p_paid_kobo: Number(event.data?.amount ?? 0),
    });
  } else if (reference.startsWith("orderpay_")) {
    await confirmOrderPayment(supabase, reference);
  } else if (reference.startsWith("topup_")) {
    await supabase
      .from("message_topups")
      .update({ status: "success", paid_at: new Date().toISOString() })
      .eq("reference", reference)
      .eq("status", "pending");
  } else {
    await supabase
      .from("ai_design_payments")
      .update({ status: "success", verified_at: new Date().toISOString() })
      .eq("reference", reference)
      .eq("status", "pending");
  }

  return new Response("ok", { status: 200 });
});

// Activates a paid plan in the background, even if the owner never returns
// from checkout. Idempotent with the billing-page confirmation: only the
// request that flips the row from pending activates the plan.
async function activatePlan(
  supabase: SupabaseClient,
  reference: string,
  paidKobo: number,
): Promise<void> {
  const { data: payment } = await supabase
    .from("plan_payments")
    .select("id, store_id, plan_code, amount")
    .eq("reference", reference)
    .eq("status", "pending")
    .maybeSingle();
  if (!payment) return;
  if (paidKobo < Math.round(Number(payment.amount) * 100)) return;

  const { data: updated } = await supabase
    .from("plan_payments")
    .update({ status: "success", paid_at: new Date().toISOString() })
    .eq("id", payment.id)
    .eq("status", "pending")
    .select("id");
  if (!updated || updated.length === 0) return;

  const paidUntil = new Date();
  paidUntil.setMonth(paidUntil.getMonth() + 3);
  await supabase
    .from("stores")
    .update({ plan_code: payment.plan_code, plan_paid_until: paidUntil.toISOString() })
    .eq("id", payment.store_id);
}

async function confirmOrderPayment(supabase: SupabaseClient, reference: string): Promise<void> {
  const { data: link } = await supabase
    .from("order_payment_links")
    .select("id, order_id, store_id, amount, status")
    .eq("reference", reference)
    .eq("status", "pending")
    .maybeSingle();
  if (!link) return;

  const paidAt = new Date().toISOString();
  const { error } = await supabase
    .from("order_payment_links")
    .update({ status: "success", paid_at: paidAt })
    .eq("id", link.id)
    .eq("status", "pending");
  if (error) return;

  await supabase.from("payments").insert({
    store_id: link.store_id,
    order_id: link.order_id,
    amount: link.amount,
    method: "paystack",
    reference,
    paid_at: paidAt,
  });
}

type PaystackWebhookData = Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

async function handleDedicatedAccountAssigned(
  supabase: SupabaseClient,
  data: PaystackWebhookData,
): Promise<void> {
  const customer = asRecord(data.customer);
  const bank = asRecord(data.bank);
  const customerCode = customer.customer_code as string | undefined;
  if (!customerCode) return;

  await supabase
    .from("dedicated_accounts")
    .update({
      paystack_dedicated_account_id: data.id != null ? String(data.id) : null,
      account_number: (data.account_number as string | undefined) ?? null,
      account_name: (data.account_name as string | undefined) ?? null,
      bank_name: (bank.name as string | undefined) ?? null,
      status: "active",
      failure_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq("paystack_customer_code", customerCode);
}

async function handleDedicatedAccountFailed(
  supabase: SupabaseClient,
  data: PaystackWebhookData,
): Promise<void> {
  const customer = asRecord(data.customer);
  const customerCode = customer.customer_code as string | undefined;
  if (!customerCode) return;

  await supabase
    .from("dedicated_accounts")
    .update({
      status: "failed",
      failure_reason:
        (data.reason as string | undefined) ??
        (data.message as string | undefined) ??
        "Paystack could not assign an account number",
      updated_at: new Date().toISOString(),
    })
    .eq("paystack_customer_code", customerCode);
}

// A client paid the shop's dedicated account number by plain bank transfer.
// Idempotent on paystack_ref (unique index): a replayed webhook hits the
// unique-violation branch below and returns without matching again.
async function handleIncomingTransfer(
  supabase: SupabaseClient,
  data: PaystackWebhookData,
): Promise<void> {
  const reference = data.reference as string | undefined;
  if (!reference) return;

  const customer = asRecord(data.customer);
  const customerCode = customer.customer_code as string | undefined;
  if (!customerCode) return;

  const { data: dedicated } = await supabase
    .from("dedicated_accounts")
    .select("store_id")
    .eq("paystack_customer_code", customerCode)
    .maybeSingle();
  if (!dedicated) return;

  const authorization = asRecord(data.authorization);
  const senderName =
    (authorization.sender_name as string | undefined) ??
    (authorization.narration as string | undefined) ??
    null;
  const senderBank = (authorization.sender_bank as string | undefined) ?? null;
  const amountKobo = Number(data.amount ?? 0);
  const paidAt = (data.paid_at as string | undefined) ?? new Date().toISOString();

  const { data: inserted, error } = await supabase
    .from("incoming_transfers")
    .insert({
      store_id: dedicated.store_id,
      amount: amountKobo / 100,
      sender_name: senderName,
      sender_bank: senderBank,
      paystack_ref: reference,
      received_at: paidAt,
    })
    .select("id")
    .maybeSingle();
  if (error || !inserted) return; // already processed (unique_violation on replay)

  const { data: matchedOrderId } = await supabase.rpc("match_incoming_transfer", {
    p_transfer_id: inserted.id,
  });
  if (matchedOrderId) {
    await notifyTransferMatched(dedicated.store_id, matchedOrderId as string, inserted.id);
  }
}

// Hands off to the Node app for the owner alert (WhatsApp send + in-app
// notification) since that's where the confirmed-working WhatsApp gateway
// secrets live (src/lib/whatsapp-send.server.ts) -- Deno edge function
// secrets are a separate store, so this is not assumed to be duplicated
// here. Same INTERNAL_API_SECRET as the pg_cron digest job; failure here
// only skips the alert, never the payment that was already recorded.
async function notifyTransferMatched(
  storeId: string,
  orderId: string,
  transferId: string,
): Promise<void> {
  const secret = Deno.env.get("INTERNAL_API_SECRET");
  const baseUrl = Deno.env.get("APP_BASE_URL") ?? "https://jaylor.com.ng";
  if (!secret) return;
  try {
    await fetch(`${baseUrl}/api/internal/transfer-alert`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Secret": secret },
      body: JSON.stringify({ storeId, orderId, transferId }),
    });
  } catch (error) {
    console.error("[paystack-webhook] transfer-alert relay failed", error);
  }
}
