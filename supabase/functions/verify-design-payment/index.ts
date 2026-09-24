import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS_HEADERS, errorResponse, jsonResponse } from "../_shared/ai.ts";
import { verifyTransaction } from "../_shared/paystack.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  let body: { reference?: string; phone?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }
  if (
    typeof body.reference !== "string" ||
    !body.reference.startsWith("design_") ||
    body.reference.length > 100 ||
    typeof body.phone !== "string"
  ) {
    return errorResponse("reference and phone are required");
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // The payment must exist and belong to the guest who started it.
  const { data: payment } = await supabase
    .from("ai_design_payments")
    .select("id, phone, amount, status")
    .eq("reference", body.reference)
    .maybeSingle();
  if (!payment || payment.phone !== body.phone) return errorResponse("Payment not found", 404);
  if (payment.status !== "pending") return jsonResponse({ status: payment.status });

  try {
    const transaction = await verifyTransaction(body.reference);
    // Only a confirmed, fully-paid transaction changes the record; anything else stays pending.
    if (transaction.status !== "success" || Number(transaction.amount ?? 0) < Number(payment.amount)) {
      return jsonResponse({ status: "failed" });
    }

    const { error } = await supabase
      .from("ai_design_payments")
      .update({ status: "success", verified_at: new Date().toISOString() })
      .eq("id", payment.id)
      .eq("status", "pending");
    if (error) throw error;

    return jsonResponse({ status: "success" });
  } catch (error) {
    console.error("[verify-design-payment]", error);
    return errorResponse("Could not verify this payment", 500);
  }
});
