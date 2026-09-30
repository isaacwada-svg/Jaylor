import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS_HEADERS, errorResponse, jsonResponse } from "../_shared/ai.ts";
import { verifyTransaction } from "../_shared/paystack.ts";

// Belt-and-suspenders alongside the paystack-webhook, same as
// verify-order-payment -- but gated by the order's own tracking_token
// instead of a signed-in staff session, since the client on /t/$token has
// no Jaylor account.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  let body: { token?: string; reference?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }
  if (!body.token || typeof body.token !== "string" || body.token.length > 200) {
    return errorResponse("token is required");
  }
  if (!body.reference || typeof body.reference !== "string" || body.reference.length > 200) {
    return errorResponse("reference is required");
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: order } = await supabase
    .from("orders")
    .select("id")
    .eq("tracking_token", body.token)
    .maybeSingle();
  if (!order) return errorResponse("Order not found", 404);

  const { data: link } = await supabase
    .from("order_payment_links")
    .select("id, order_id, store_id, amount, status")
    .eq("reference", body.reference)
    .eq("order_id", order.id)
    .maybeSingle();
  if (!link) return errorResponse("Payment link not found", 404);

  if (link.status === "success") return jsonResponse({ status: "success" });

  try {
    const transaction = (await verifyTransaction(body.reference)) as {
      status: string;
      amount?: number;
    };
    const expectedKobo = Math.round(Number(link.amount) * 100);
    if (transaction.status !== "success" || Number(transaction.amount ?? 0) < expectedKobo) {
      return jsonResponse({ status: "failed" });
    }

    const paidAt = new Date().toISOString();
    const { data: updated, error } = await supabase
      .from("order_payment_links")
      .update({ status: "success", paid_at: paidAt })
      .eq("id", link.id)
      .eq("status", "pending")
      .select("id");
    if (error) throw error;

    if (updated && updated.length > 0) {
      await supabase.from("payments").insert({
        store_id: link.store_id,
        order_id: link.order_id,
        amount: link.amount,
        method: "paystack",
        reference: body.reference,
        paid_at: paidAt,
      });
    }

    return jsonResponse({ status: "success" });
  } catch (error) {
    console.error("[verify-tracking-payment]", error);
    return errorResponse("Could not verify this payment", 500);
  }
});
