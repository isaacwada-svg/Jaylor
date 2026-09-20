import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS_HEADERS, errorResponse, jsonResponse } from "../_shared/ai.ts";
import { getRequestUser } from "../_shared/auth.ts";
import { initializeTransaction } from "../_shared/paystack.ts";
import { planFeePercent } from "../_shared/plan.ts";

type RequestBody = {
  orderId: string;
  amount: number;
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
  if (!body.orderId || !body.amount || body.amount <= 0 || !body.callbackUrl) {
    return errorResponse("orderId, a positive amount and callbackUrl are required");
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, store_id, client_id")
    .eq("id", body.orderId)
    .single();
  if (orderError || !order) return errorResponse("Order not found", 404);

  const { data: membership } = await supabase
    .from("store_members")
    .select("role, status")
    .eq("store_id", order.store_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (
    !membership ||
    membership.status !== "active" ||
    !["owner", "manager"].includes(membership.role)
  ) {
    return errorResponse("You don't have permission to do this", 403);
  }

  const { data: account } = await supabase
    .from("payment_accounts")
    .select("subaccount_code, status")
    .eq("store_id", order.store_id)
    .maybeSingle();
  if (!account || account.status !== "active" || !account.subaccount_code) {
    return errorResponse(
      "Connect a bank account under Settings > Jaylor Pay before requesting payments",
      400,
    );
  }

  const { data: store } = await supabase
    .from("stores")
    .select("plan_code, trial_ends_at")
    .eq("id", order.store_id)
    .single();
  const feePercent = planFeePercent(store?.plan_code ?? null, store?.trial_ends_at ?? null);
  const platformFee = Math.round(body.amount * (feePercent / 100) * 100) / 100;

  const { data: client } = await supabase
    .from("clients")
    .select("phone")
    .eq("id", order.client_id)
    .maybeSingle();

  const reference = `orderpay_${crypto.randomUUID().replace(/-/g, "")}`;
  const digitsOnly = (client?.phone ?? "guest").replace(/\D/g, "") || "guest";

  try {
    const transaction = await initializeTransaction({
      email: `${digitsOnly}@guest.jaylor.app`,
      amountKobo: Math.round(body.amount * 100),
      reference,
      callbackUrl: body.callbackUrl,
      channels: ["card", "bank", "ussd", "bank_transfer"],
      subaccount: account.subaccount_code,
    });

    const { error } = await supabase.from("order_payment_links").insert({
      order_id: order.id,
      store_id: order.store_id,
      amount: body.amount,
      platform_fee: platformFee,
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
