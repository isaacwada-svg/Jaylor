import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS_HEADERS, errorResponse, jsonResponse } from "../_shared/ai.ts";
import { getRequestUser } from "../_shared/auth.ts";

// Permanent account deletion: super_admin only, given the blast radius. The
// public-schema side (owned stores, staff memberships, profile row) is
// handled by admin_delete_user_data() -- see that migration for why -- this
// function's own job is just the auth.users identity itself, which only the
// Admin API can safely remove (it also cleans up sessions, identities and
// MFA factors GoTrue manages internally).

type RequestBody = { userId: string; reason: string };

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
  if (!body.userId || !body.reason?.trim()) {
    return errorResponse("userId and a reason are required");
  }
  if (body.reason.trim().length > 500) {
    return errorResponse("Reason is too long");
  }
  if (body.userId === user.id) {
    return errorResponse("You can't delete your own account from here", 400);
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
    return errorResponse("Only a super admin can delete a user", 403);
  }

  const { error: dataError } = await supabase.rpc("admin_delete_user_data", {
    p_user_id: body.userId,
    p_reason: body.reason.trim(),
  });
  if (dataError) {
    console.error("[admin-delete-user]", dataError);
    return errorResponse(dataError.message || "Could not delete this user's data", 400);
  }

  const { error: authError } = await supabase.auth.admin.deleteUser(body.userId);
  if (authError) {
    console.error("[admin-delete-user]", authError);
    return errorResponse(
      "Deleted this user's data, but could not remove their sign-in — contact support",
      500,
    );
  }

  return jsonResponse({ result: { deleted: true } });
});
