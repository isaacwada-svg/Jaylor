import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS_HEADERS, errorResponse, jsonResponse } from "../_shared/ai.ts";

type RequestBody = {
  designId: string;
  phone: string;
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
  if (!body.designId || !body.phone) {
    return errorResponse("designId and phone are required");
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: design } = await supabase
    .from("ai_designs")
    .select("id, phone")
    .eq("id", body.designId)
    .maybeSingle();
  if (!design || design.phone !== body.phone) {
    return errorResponse("Design not found", 404);
  }

  const { error } = await supabase
    .from("ai_designs")
    .update({ selected_at: new Date().toISOString() })
    .eq("id", body.designId);
  if (error) return errorResponse("Could not save your selection", 500);

  return jsonResponse({ ok: true });
});
