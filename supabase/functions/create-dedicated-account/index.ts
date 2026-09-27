import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS_HEADERS, errorResponse, jsonResponse } from "../_shared/ai.ts";
import { getRequestUser } from "../_shared/auth.ts";
import { createDedicatedAccountCustomer, createDedicatedAccount } from "../_shared/paystack.ts";

type RequestBody = { storeId: string };

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
  if (!body.storeId) return errorResponse("storeId is required");

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
    .select("name, plan_code, trial_ends_at, contact_email")
    .eq("id", body.storeId)
    .single();
  if (storeError || !store) return errorResponse("Store not found", 404);

  const onTrial = !!store.trial_ends_at && new Date(store.trial_ends_at) > new Date();
  if (!onTrial && store.plan_code === "free") {
    return errorResponse("A business account number needs the Growth plan or above", 400);
  }

  const { data: account } = await supabase
    .from("payment_accounts")
    .select("subaccount_code, status")
    .eq("store_id", body.storeId)
    .maybeSingle();
  if (!account || account.status !== "active" || !account.subaccount_code) {
    return errorResponse(
      "Connect a bank account under Settings > Jaylor Pay first, so your business account number can settle to it",
      400,
    );
  }

  const { data: existing } = await supabase
    .from("dedicated_accounts")
    .select("status")
    .eq("store_id", body.storeId)
    .maybeSingle();
  if (existing?.status === "active") {
    return errorResponse("This shop already has a business account number", 400);
  }

  try {
    const [firstName, ...rest] = store.name.trim().split(/\s+/);
    const customer = await createDedicatedAccountCustomer({
      email: store.contact_email ?? `store+${body.storeId}@jaylor.com.ng`,
      firstName: firstName || store.name,
      lastName: rest.join(" ") || store.name,
    });

    await supabase.from("dedicated_accounts").upsert(
      {
        store_id: body.storeId,
        paystack_customer_code: customer.customer_code,
        status: "pending",
        failure_reason: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "store_id" },
    );

    const dedicated = await createDedicatedAccount({
      customerCode: customer.customer_code,
      subaccount: account.subaccount_code,
    });

    // Paystack usually confirms via the dedicatedaccount.assign.success/failed
    // webhook, but the initial response already carries the details when the
    // assignment happens synchronously -- store what we have now either way.
    await supabase
      .from("dedicated_accounts")
      .update({
        paystack_dedicated_account_id: String(dedicated.id ?? ""),
        account_number: dedicated.account_number ?? null,
        account_name: dedicated.account_name ?? null,
        bank_name: dedicated.bank?.name ?? null,
        status: dedicated.account_number ? "active" : "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("store_id", body.storeId);

    return jsonResponse({ result: { status: dedicated.account_number ? "active" : "pending" } });
  } catch (error) {
    await supabase
      .from("dedicated_accounts")
      .update({
        status: "failed",
        failure_reason: error instanceof Error ? error.message : "Could not request an account",
        updated_at: new Date().toISOString(),
      })
      .eq("store_id", body.storeId);
    return errorResponse(
      error instanceof Error ? error.message : "Could not request a business account number",
      500,
    );
  }
});
