import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS_HEADERS, errorResponse, jsonResponse } from "../_shared/ai.ts";
import { getRequestUser } from "../_shared/auth.ts";
import { verifyTransaction } from "../_shared/paystack.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const user = await getRequestUser(req);
  if (!user) return errorResponse("Not signed in", 401);

  let body: { reference?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }
  if (!body.reference || typeof body.reference !== "string" || body.reference.length > 200) {
    return errorResponse("reference is required");
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: link } = await supabase
    .from("order_payment_links")
    .select("id, order_id, store_id, amount, status")
    .eq("reference", body.reference)
    .maybeSingle();
  if (!link) return errorResponse("Payment link not found", 404);

  // Only active staff of the store that owns this payment link may confirm it.
  const { data: membership } = await supabase
    .from("store_members")
    .select("role, status")
    .eq("store_id", link.store_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership || membership.status !== "active") {
    return errorResponse("Payment link not found", 404);
  }

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
    console.error("[verify-order-payment]", error);
    return errorResponse("Could not verify this payment", 500);
  }
});
