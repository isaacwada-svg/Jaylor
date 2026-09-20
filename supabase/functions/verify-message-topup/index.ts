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
  if (!body.reference) return errorResponse("reference is required");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: topup } = await supabase
    .from("message_topups")
    .select("id, status")
    .eq("reference", body.reference)
    .maybeSingle();
  if (!topup) return errorResponse("Top-up not found", 404);

  if (topup.status === "success") return jsonResponse({ status: "success" });

  try {
    const transaction = await verifyTransaction(body.reference);
    if (transaction.status !== "success") {
      return jsonResponse({ status: "failed" });
    }

    const { error } = await supabase
      .from("message_topups")
      .update({ status: "success", paid_at: new Date().toISOString() })
      .eq("id", topup.id)
      .eq("status", "pending");
    if (error) throw error;

    return jsonResponse({ status: "success" });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Could not verify this payment",
      500,
    );
  }
});
