import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS_HEADERS, errorResponse, jsonResponse } from "../_shared/ai.ts";
import { getRequestUser } from "../_shared/auth.ts";
import { AiGatewayBlockedError, runAiGatewayCall } from "../_shared/ai-gateway.ts";

type RequestBody = {
  storeId: string;
  clientName: string;
  garmentType: string;
  orderStatus: string;
  balance: number;
  deliveryDate: string | null;
  incomingMessage: string | null;
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
  if (!body.storeId) return errorResponse("storeId is required");
  if (!body.clientName || !body.garmentType) {
    return errorResponse("clientName and garmentType are required");
  }

  const supabase = serviceClient();
  const { data: isMember } = await supabase.rpc("is_store_member", { _store_id: body.storeId });
  if (!isMember) return errorResponse("You don't have access to this shop", 403);

  const context = `Client: ${body.clientName}
Garment: ${body.garmentType}
Order status: ${body.orderStatus}
Balance owed: ${body.balance > 0 ? `₦${body.balance.toLocaleString()}` : "fully paid"}
Delivery date: ${body.deliveryDate ?? "not set"}
Client's message just now: ${body.incomingMessage ? `"${body.incomingMessage}"` : "(none — this is a check-in, not a reply)"}`;

  const system = `You draft short, warm WhatsApp messages for a Nigerian tailor to send their client. Nigerian English tone, polite and brief (under 350 characters), no emoji spam (at most one). Mention only the facts given — never invent a price, date, or promise. If replying to a client message, address it directly. Output ONLY the message text, nothing else (no quotes, no preamble).`;

  try {
    const { content } = await runAiGatewayCall({
      supabase,
      storeId: body.storeId,
      userId: user.id,
      featureKey: "ai_replies",
      systemPrompt: system,
      userMessage: context,
      triggeredByUserAction: body.triggeredByUserAction === true,
    });
    return jsonResponse({ result: content.trim() });
  } catch (error) {
    if (error instanceof AiGatewayBlockedError) return errorResponse(error.message, 429);
    return errorResponse(error instanceof Error ? error.message : "Could not draft a reply", 500);
  }
});
