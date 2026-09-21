import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS_HEADERS, errorResponse, jsonResponse } from "../_shared/ai.ts";
import { getRequestUser } from "../_shared/auth.ts";

const AI_DESIGN_BUCKET = "ai-design-photos";

type RequestBody = {
  storeId: string;
  clientId: string;
};

/** Accepts either a bare storage path or a legacy full public/signed URL. */
function toStoragePath(bucket: string, value: string): string {
  const marker = `/${bucket}/`;
  const at = value.indexOf(marker);
  return at === -1 ? value.replace(/^\/+/, "") : value.slice(at + marker.length);
}

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
  if (!body.storeId || !body.clientId) {
    return errorResponse("storeId and clientId are required");
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

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id, phone, whatsapp_phone")
    .eq("id", body.clientId)
    .eq("store_id", body.storeId)
    .maybeSingle();
  if (clientError) return errorResponse("Could not look up this client", 500);
  if (!client) return errorResponse("Client not found", 404);

  const { count: orderCount } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("client_id", body.clientId);
  if (orderCount && orderCount > 0) {
    return errorResponse(
      "This client has order history and can't be deleted. Orders are kept for your own records — remove them first if you're sure you want to erase this client entirely.",
      409,
    );
  }

  try {
    const phones = [client.phone, client.whatsapp_phone].filter(Boolean) as string[];
    if (phones.length > 0) {
      const { data: designs } = await supabase
        .from("ai_designs")
        .select("id, image_url, selfie_url")
        .eq("store_id", body.storeId)
        .in("phone", phones);

      const paths = (designs ?? [])
        .flatMap((d) => [d.image_url, d.selfie_url])
        .filter(Boolean)
        .map((v) => toStoragePath(AI_DESIGN_BUCKET, v as string));
      if (paths.length > 0) {
        await supabase.storage.from(AI_DESIGN_BUCKET).remove(paths);
      }
      if (designs && designs.length > 0) {
        await supabase
          .from("ai_designs")
          .delete()
          .in(
            "id",
            designs.map((d) => d.id),
          );
      }
    }

    const { data: fullClient } = await supabase
      .from("clients")
      .select("photo_url")
      .eq("id", body.clientId)
      .maybeSingle();
    if (fullClient?.photo_url) {
      // clients.photo_url has no established bucket today (no upload path
      // wires it up yet) — best-effort only, using the same bucket AI
      // design photos live in since that's the one bucket this app writes
      // client-facing images to; harmless no-op if it doesn't match.
      await supabase.storage
        .from(AI_DESIGN_BUCKET)
        .remove([toStoragePath(AI_DESIGN_BUCKET, fullClient.photo_url)]);
    }

    const { error: deleteError } = await supabase.from("clients").delete().eq("id", body.clientId);
    if (deleteError) throw deleteError;

    return jsonResponse({ result: { deleted: true } });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Could not delete this client",
      500,
    );
  }
});
