import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS_HEADERS, errorResponse, jsonResponse } from "../_shared/ai.ts";

type RequestBody = {
  designId?: string;
  phone?: string;
  /** Secret share token returned only to the guest who generated the design. */
  shareToken?: string;
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
  if (
    typeof body.designId !== "string" ||
    typeof body.phone !== "string" ||
    typeof body.shareToken !== "string" ||
    body.shareToken.length < 16 ||
    body.shareToken.length > 200
  ) {
    return errorResponse("designId, phone and shareToken are required");
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: design } = await supabase
    .from("ai_designs")
    .select("id, phone, share_token, selected_at")
    .eq("id", body.designId)
    .maybeSingle();
  if (!design || design.phone !== body.phone || design.share_token !== body.shareToken) {
    return errorResponse("Design not found", 404);
  }
  if (design.selected_at) return jsonResponse({ ok: true });

  const { error } = await supabase
    .from("ai_designs")
    .update({ selected_at: new Date().toISOString() })
    .eq("id", design.id)
    .is("selected_at", null);
  if (error) return errorResponse("Could not save your selection", 500);

  return jsonResponse({ ok: true });
});
