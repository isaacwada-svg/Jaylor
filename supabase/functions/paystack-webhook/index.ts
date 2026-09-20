import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isValidWebhookSignature } from "../_shared/paystack.ts";

// Configure this URL as the webhook endpoint in your Paystack dashboard.
// Belt-and-suspenders alongside verify-design-payment: covers the case where
// the customer closes the tab before returning from Paystack's checkout.

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
  if (event.event !== "charge.success") {
    return new Response("ignored", { status: 200 });
  }

  const reference = event.data?.reference;
  if (!reference) return new Response("ok", { status: 200 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (reference.startsWith("orderpay_")) {
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

async function confirmOrderPayment(
  supabase: ReturnType<typeof createClient>,
  reference: string,
): Promise<void> {
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
