import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS_HEADERS, errorResponse, jsonResponse } from "../_shared/ai.ts";
import { getRequestUser } from "../_shared/auth.ts";

// Support login: lets a super admin open a store's real UI as its owner,
// for troubleshooting. Deliberately restricted to super_admin (not admin or
// support) given the risk, time-boxed to 15 minutes via the existing
// support_grants table, and fully audit-logged (who, which store, why).

type RequestBody = { storeId: string; reason: string };

const IMPERSONATION_MINUTES = 15;

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
  if (!body.storeId || !body.reason?.trim()) {
    return errorResponse("storeId and a reason are required");
  }
  if (body.reason.trim().length > 500) {
    return errorResponse("Reason is too long");
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: admin } = await supabase
    .from("platform_admins")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!admin || admin.role !== "super_admin") {
    return errorResponse("Only a super admin can start a support session", 403);
  }

  const { data: store } = await supabase
    .from("stores")
    .select("id, name")
    .eq("id", body.storeId)
    .maybeSingle();
  if (!store) return errorResponse("Store not found", 404);

  const { data: owner } = await supabase
    .from("store_members")
    .select("user_id")
    .eq("store_id", body.storeId)
    .eq("role", "owner")
    .eq("status", "active")
    .maybeSingle();
  if (!owner) return errorResponse("This store has no active owner to log in as", 404);

  const { data: ownerUser } = await supabase.auth.admin.getUserById(owner.user_id);
  const ownerEmail = ownerUser?.user?.email;
  if (!ownerEmail) return errorResponse("Could not find the owner's account", 404);

  const expiresAt = new Date(Date.now() + IMPERSONATION_MINUTES * 60 * 1000).toISOString();

  const { data: grant, error: grantError } = await supabase
    .from("support_grants")
    .insert({
      store_id: body.storeId,
      granted_by: user.id,
      admin_id: user.id,
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (grantError || !grant) {
    console.error("[admin-impersonate-store]", grantError);
    return errorResponse("Could not start this support session", 500);
  }

  await supabase.rpc("log_audit_event", {
    p_store_id: body.storeId,
    p_action: "impersonation_started",
    p_entity: "support_grants",
    p_entity_id: grant.id,
    p_metadata: { reason: body.reason.trim(), admin_email: user.email ?? "" },
  });

  const origin = req.headers.get("origin") ?? "https://jaylor.com.ng";
  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: ownerEmail,
    options: {
      redirectTo: `${origin}/dashboard?impersonating=1&support_admin=${encodeURIComponent(user.id)}&store=${encodeURIComponent(store.name)}`,
    },
  });
  const actionLink = linkData?.properties?.action_link;
  if (linkError || !actionLink) {
    console.error("[admin-impersonate-store]", linkError);
    return errorResponse("Could not create a support session link", 500);
  }

  return jsonResponse({
    result: { action_link: actionLink, store_name: store.name, expires_at: expiresAt },
  });
});
