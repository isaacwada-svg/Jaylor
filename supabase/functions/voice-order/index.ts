import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS_HEADERS, errorResponse, jsonResponse } from "../_shared/ai.ts";
import { getRequestUser } from "../_shared/auth.ts";
import { AiGatewayBlockedError, runAiGatewayCall } from "../_shared/ai-gateway.ts";

type RequestBody = {
  storeId: string;
  transcript: string;
  garmentTypes: string[];
  today: string; // ISO date, so relative dates ("in two weeks") resolve correctly
  triggeredByUserAction?: boolean;
};

function serviceClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const user = await getRequestUser(req);
  if (!user) return errorResponse("Sign in to use this feature", 401);

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  const transcript = body.transcript?.trim();
  if (!transcript) return errorResponse("transcript is required");
  if (!body.storeId) return errorResponse("storeId is required");

  const supabase = serviceClient();
  const { data: isMember } = await supabase.rpc("is_store_member", { _store_id: body.storeId });
  if (!isMember) return errorResponse("You don't have access to this shop", 403);

  const garmentTypes = Array.isArray(body.garmentTypes) ? body.garmentTypes : [];
  const today = body.today || new Date().toISOString().slice(0, 10);

  const system = `You turn a Nigerian tailor's spoken description of a new order into structured JSON fields. Today's date is ${today}.
Only pick garment_type from this exact list (or null if none match): ${JSON.stringify(garmentTypes)}.
Never invent a price, date, or detail that wasn't said. If something isn't mentioned, use null.
Respond with ONLY a JSON object shaped exactly like:
{"garment_type": string|null, "quantity": number, "style_notes": string, "price": number|null, "delivery_date": string|null, "rush": boolean}
delivery_date must be an ISO date (YYYY-MM-DD) resolved from today's date, or null. quantity defaults to 1. rush is true only if urgency was explicitly mentioned.`;

  try {
    const { content } = await runAiGatewayCall({
      supabase,
      storeId: body.storeId,
      userId: user.id,
      featureKey: "voice_entry",
      systemPrompt: system,
      userMessage: transcript,
      triggeredByUserAction: body.triggeredByUserAction === true,
    });
    const parsed = JSON.parse(content);
    return jsonResponse({ result: parsed });
  } catch (error) {
    if (error instanceof AiGatewayBlockedError) return errorResponse(error.message, 429);
    return errorResponse(error instanceof Error ? error.message : "Could not parse this order", 500);
  }
});
