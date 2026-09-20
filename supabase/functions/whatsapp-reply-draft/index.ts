import { callAI, CORS_HEADERS, errorResponse, jsonResponse } from "../_shared/ai.ts";

type RequestBody = {
  clientName: string;
  garmentType: string;
  orderStatus: string;
  balance: number;
  deliveryDate: string | null;
  incomingMessage: string | null;
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
  if (!body.clientName || !body.garmentType) {
    return errorResponse("clientName and garmentType are required");
  }

  const context = `Client: ${body.clientName}
Garment: ${body.garmentType}
Order status: ${body.orderStatus}
Balance owed: ${body.balance > 0 ? `₦${body.balance.toLocaleString()}` : "fully paid"}
Delivery date: ${body.deliveryDate ?? "not set"}
Client's message just now: ${body.incomingMessage ? `"${body.incomingMessage}"` : "(none — this is a check-in, not a reply)"}`;

  const system = `You draft short, warm WhatsApp messages for a Nigerian tailor to send their client. Nigerian English tone, polite and brief (under 350 characters), no emoji spam (at most one). Mention only the facts given — never invent a price, date, or promise. If replying to a client message, address it directly. Output ONLY the message text, nothing else (no quotes, no preamble).`;

  try {
    const content = await callAI([
      { role: "system", content: system },
      { role: "user", content: context },
    ]);
    return jsonResponse({ result: content.trim() });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Could not draft a reply", 500);
  }
});
