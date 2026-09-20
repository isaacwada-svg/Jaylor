import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS_HEADERS, errorResponse, jsonResponse } from "../_shared/ai.ts";
import { initializeTransaction } from "../_shared/paystack.ts";

const DESIGN_FEE_KOBO = 30000; // ₦300

type RequestBody = {
  storeId: string;
  phone: string;
  callbackUrl: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }
  if (!body.storeId || !body.phone?.trim() || !body.callbackUrl) {
    return errorResponse("storeId, phone and callbackUrl are required");
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const reference = `design_${crypto.randomUUID().replace(/-/g, "")}`;
  const digitsOnly = body.phone.replace(/\D/g, "");

  try {
    const transaction = await initializeTransaction({
      email: `${digitsOnly}@guest.jaylor.app`,
      amountKobo: DESIGN_FEE_KOBO,
      reference,
      callbackUrl: body.callbackUrl,
    });

    const { error } = await supabase.from("ai_design_payments").insert({
      store_id: body.storeId,
      phone: body.phone,
      reference: transaction.reference,
      amount: DESIGN_FEE_KOBO,
    });
    if (error) throw error;

    return jsonResponse({
      authorization_url: transaction.authorization_url,
      reference: transaction.reference,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Could not start payment",
      500,
    );
  }
});
