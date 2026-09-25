import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS_HEADERS, errorResponse, jsonResponse } from "../_shared/ai.ts";
import { getRequestUser } from "../_shared/auth.ts";
import { AiGatewayBlockedError, runAiGatewayCall } from "../_shared/ai-gateway.ts";

const MAX_AUDIO_SECONDS = 60;
// Generous ceiling on the base64 payload itself, as a defensive check
// independent of the client-reported duration (~60s of webm/opus voice
// audio is well under 1MB; this just guards against a malformed request).
const MAX_AUDIO_BASE64_BYTES = 4_000_000;

type RequestBody = {
  storeId: string;
  transcript?: string;
  audioBase64?: string;
  audioFormat?: string;
  audioDurationSeconds?: number;
  garmentTypes: string[];
  today: string; // ISO date, so relative dates ("in two weeks") resolve correctly
  triggeredByUserAction?: boolean;
};

type ExtractionResult = {
  garment_type: string | null;
  quantity: number;
  style_notes: string;
  price: number | null;
  delivery_date: string | null;
  rush: boolean;
  confidence: "high" | "low";
};

function serviceClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

/** Never present a guessed order from a recording/dictation the model wasn't confident about — leave it for the tailor to fill in instead of risking a wrong price or date. */
function blankLowConfidenceFields(result: ExtractionResult): ExtractionResult {
  if (result.confidence !== "low") return result;
  return {
    garment_type: null,
    quantity: 1,
    style_notes: "",
    price: null,
    delivery_date: null,
    rush: false,
    confidence: "low",
  };
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

  const transcript = body.transcript?.trim();
  const hasAudio = Boolean(body.audioBase64);
  if (!transcript && !hasAudio) return errorResponse("transcript or audioBase64 is required");

  const supabase = serviceClient();
  const { data: isMember } = await supabase.rpc("is_store_member", { _store_id: body.storeId });
  if (!isMember) return errorResponse("You don't have access to this shop", 403);

  if (hasAudio) {
    // Recorded-audio upload + server transcription is a paid-plan feature —
    // the default, free path is device-keyboard voice-typing (a transcript).
    const { data: planCode } = await supabase.rpc("effective_plan_code", {
      _store_id: body.storeId,
    });
    if (planCode === "free") {
      return errorResponse(
        "Recording audio is a paid-plan feature — use your keyboard's voice typing instead.",
        403,
      );
    }
    if (!body.audioDurationSeconds || body.audioDurationSeconds > MAX_AUDIO_SECONDS) {
      return errorResponse(`Recordings are limited to ${MAX_AUDIO_SECONDS} seconds`, 400);
    }
    if ((body.audioBase64?.length ?? 0) > MAX_AUDIO_BASE64_BYTES) {
      return errorResponse("Recording is too large", 400);
    }
  }

  // Both values are interpolated into the system prompt, so accept only strict shapes.
  const garmentTypes = (Array.isArray(body.garmentTypes) ? body.garmentTypes : [])
    .filter((g): g is string => typeof g === "string" && /^[A-Za-z0-9 '&()\/-]{1,40}$/.test(g))
    .slice(0, 60);
  const today =
    typeof body.today === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(body.today) &&
    !Number.isNaN(Date.parse(body.today))
      ? body.today
      : new Date().toISOString().slice(0, 10);

  const system = `You turn a Nigerian tailor's spoken description of a new order into structured JSON fields. Today's date is ${today}.
Only pick garment_type from this exact list (or null if none match): ${JSON.stringify(garmentTypes)}.
Never invent a price, date, or detail that wasn't said. If something isn't mentioned, use null.
Respond with ONLY a JSON object shaped exactly like:
{"garment_type": string|null, "quantity": number, "style_notes": string, "price": number|null, "delivery_date": string|null, "rush": boolean, "confidence": "high"|"low"}
delivery_date must be an ISO date (YYYY-MM-DD) resolved from today's date, or null. quantity defaults to 1. rush is true only if urgency was explicitly mentioned.
Set confidence to "low" if the audio/text was unclear, mumbled, too quiet, or you had to guess at more than one field — never guess a price or date you aren't confident about.`;

  try {
    const { content } = await runAiGatewayCall({
      supabase,
      storeId: body.storeId,
      userId: user.id,
      featureKey: "voice_entry",
      systemPrompt: system,
      userMessage: transcript,
      audio: hasAudio
        ? { base64: body.audioBase64!, format: body.audioFormat || "webm" }
        : undefined,
      triggeredByUserAction: body.triggeredByUserAction === true,
    });
    const parsed = blankLowConfidenceFields(JSON.parse(content));
    return jsonResponse({ result: parsed });
  } catch (error) {
    if (error instanceof AiGatewayBlockedError) return errorResponse(error.message, 429);
    return errorResponse(
      error instanceof Error ? error.message : "Could not parse this order",
      500,
    );
  }
});
