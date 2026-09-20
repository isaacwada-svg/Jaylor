import { callAI, CORS_HEADERS, errorResponse, jsonResponse } from "../_shared/ai.ts";
import { getRequestUser } from "../_shared/auth.ts";

type RequestBody = {
  garmentType: string;
  quantity: number;
  rush: boolean;
  materialSource: "customer" | "tailor";
  styleNotes: string;
  stats: {
    avgPrice: number;
    minPrice: number;
    maxPrice: number;
    count: number;
    avgYards: number | null;
  };
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
  if (!body.garmentType || !body.stats || body.stats.count === 0) {
    return errorResponse("garmentType and non-empty stats are required");
  }

  const { stats } = body;
  const context = `Garment: ${body.garmentType}, quantity ${body.quantity || 1}
Rush order: ${body.rush ? "yes" : "no"}
Fabric: ${body.materialSource === "tailor" ? "tailor is buying it" : "customer supplied it"}
Style notes: ${body.styleNotes || "(none)"}

This tailor's own past prices for this exact garment type (${stats.count} order${stats.count === 1 ? "" : "s"}):
Average ₦${Math.round(stats.avgPrice).toLocaleString()}, range ₦${Math.round(stats.minPrice).toLocaleString()}–₦${Math.round(stats.maxPrice).toLocaleString()}.
${stats.avgYards ? `Average fabric used: ${stats.avgYards.toFixed(1)} yards.` : ""}`;

  const system = `You help a Nigerian tailor sanity-check a price for a new order, using ONLY their own historical average given below — never invent a market price from general knowledge. Suggest a price range close to their own history, adjusted only modestly for rush orders (a bit higher) or notably complex style notes (a bit higher). If nothing stands out, just suggest their own average range back. If fabric yardage history is given, suggest a yardage estimate for the requested quantity too. Keep it to 2-3 short sentences, plain language, no markdown. Always make clear this is a suggestion to review, not a rule.`;

  try {
    const content = await callAI([
      { role: "system", content: system },
      { role: "user", content: context },
    ]);
    return jsonResponse({ result: content.trim() });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Could not suggest a price", 500);
  }
});
