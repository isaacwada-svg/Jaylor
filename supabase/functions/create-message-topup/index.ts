import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS_HEADERS, errorResponse, jsonResponse } from "../_shared/ai.ts";
import { getRequestUser } from "../_shared/auth.ts";
import { initializeTransaction } from "../_shared/paystack.ts";

const TOPUP_QUANTITY = 100;
const TOPUP_AMOUNT_NGN = 2000;

type RequestBody = {
  storeId: string;
  callbackUrl: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const user = await getRequestUser(req);
  if (!user) return errorResponse("Not signed in", 401);

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }
  if (!body.storeId || !body.callbackUrl) {
    return errorResponse("storeId and callbackUrl are required");
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: membership } = await supabase
    .from("store_members")
    .select("role, status")
    .eq("store_id", body.storeId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (
    !membership ||
    membership.status !== "active" ||
    !["owner", "manager"].includes(membership.role)
  ) {
    return errorResponse("You don't have permission to do this", 403);
  }

  const reference = `topup_${crypto.randomUUID().replace(/-/g, "")}`;

  try {
    // Paystack requires a real customer email — the synthetic guest fallback is rejected.
    const { data: authUser } = await supabase.auth.admin.getUserById(user.id);
    const email = authUser?.user?.email;
    if (!email) return errorResponse("Your account needs an email address to make payments", 400);

    const transaction = await initializeTransaction({
      email,
      amountKobo: TOPUP_AMOUNT_NGN * 100,
      reference,
      callbackUrl: body.callbackUrl,
      channels: ["card", "bank", "ussd", "bank_transfer"],
    });

    const { error } = await supabase.from("message_topups").insert({
      store_id: body.storeId,
      quantity: TOPUP_QUANTITY,
      amount: TOPUP_AMOUNT_NGN,
      reference: transaction.reference,
    });
    if (error) throw error;

    return jsonResponse({
      authorization_url: transaction.authorization_url,
      reference: transaction.reference,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Could not start this payment",
      500,
    );
  }
});
