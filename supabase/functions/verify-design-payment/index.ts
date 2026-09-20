import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS_HEADERS, errorResponse, jsonResponse } from "../_shared/ai.ts";
import { verifyTransaction } from "../_shared/paystack.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  let body: { reference?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }
  if (!body.reference) return errorResponse("reference is required");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const transaction = await verifyTransaction(body.reference);
    const status = transaction.status === "success" ? "success" : "failed";

    const { error } = await supabase
      .from("ai_design_payments")
      .update({ status, verified_at: new Date().toISOString() })
      .eq("reference", body.reference)
      .eq("status", "pending");
    if (error) throw error;

    return jsonResponse({ status });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Could not verify this payment",
      500,
    );
  }
});
