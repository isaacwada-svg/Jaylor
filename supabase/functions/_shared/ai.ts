// Shared helper for calling Lovable AI Gateway from edge functions.
// Requires the LOVABLE_API_KEY secret, which Lovable Cloud provisions
// automatically once AI is enabled for this project.

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.5-flash";

export type ChatMessage = { role: "system" | "user"; content: string };

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export async function callAI(
  messages: ChatMessage[],
  opts?: { model?: string; json?: boolean },
): Promise<string> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    throw new Error("AI is not enabled for this project yet.");
  }

  const body: Record<string, unknown> = {
    model: opts?.model ?? DEFAULT_MODEL,
    messages,
  };
  if (opts?.json) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(LOVABLE_AI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 429) throw new Error("Too many AI requests right now — try again shortly.");
  if (res.status === 402) throw new Error("AI credits are exhausted for this project.");
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI request failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("AI returned an unexpected response");
  return content;
}

export type ImageContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

/**
 * Generates an image via Lovable AI Gateway's multimodal chat endpoint.
 * Returns a data: URL (base64) for the generated image.
 */
export async function generateImage(
  parts: ImageContentPart[],
  opts?: { model?: string },
): Promise<string> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    throw new Error("AI is not enabled for this project yet.");
  }

  const res = await fetch(LOVABLE_AI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts?.model ?? "google/gemini-2.5-flash-image-preview",
      messages: [{ role: "user", content: parts }],
      modalities: ["image", "text"],
    }),
  });

  if (res.status === 429) throw new Error("Too many AI requests right now — try again shortly.");
  if (res.status === 402) throw new Error("AI credits are exhausted for this project.");
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Image generation failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const message = data?.choices?.[0]?.message;
  const imageUrl: string | undefined =
    message?.images?.[0]?.image_url?.url ?? message?.images?.[0]?.url;
  if (!imageUrl) throw new Error("AI did not return an image");
  return imageUrl;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

export function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}
