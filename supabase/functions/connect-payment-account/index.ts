import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS_HEADERS, errorResponse, jsonResponse } from "../_shared/ai.ts";
import { getRequestUser } from "../_shared/auth.ts";
import { createSubaccount, resolveAccountNumber } from "../_shared/paystack.ts";
import { planFeePercent } from "../_shared/plan.ts";

type RequestBody = {
  storeId: string;
  bankCode: string;
  bankName: string;
  accountNumber: string;
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
  if (!body.storeId || !body.bankCode || !body.accountNumber) {
    return errorResponse("storeId, bankCode and accountNumber are required");
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

  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("name, plan_code, trial_ends_at")
    .eq("id", body.storeId)
    .single();
  if (storeError || !store) return errorResponse("Store not found", 404);

  try {
    const resolved = await resolveAccountNumber(body.accountNumber, body.bankCode);
    const feePercent = planFeePercent(store.plan_code, store.trial_ends_at);

    const subaccount = await createSubaccount({
      businessName: store.name,
      bankCode: body.bankCode,
      accountNumber: body.accountNumber,
      percentageCharge: feePercent,
    });

    const { error } = await supabase.from("payment_accounts").upsert(
      {
        store_id: body.storeId,
        provider: "paystack",
        subaccount_code: subaccount.subaccount_code,
        bank_code: body.bankCode,
        bank_name: body.bankName,
        account_number: body.accountNumber,
        account_name: resolved.account_name,
        status: "active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "store_id" },
    );
    if (error) throw error;

    return jsonResponse({ result: { account_name: resolved.account_name, status: "active" } });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Could not connect this account",
      500,
    );
  }
});
