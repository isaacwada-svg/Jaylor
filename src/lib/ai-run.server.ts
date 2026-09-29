// The single engine behind every credit-based AI feature. It checks access,
// plan and daily caps, reserves credits, calls Gemini with the owner's own
// Google AI Studio key (GEMINI_API_KEY), charges on success and refunds on
// failure. Model IDs and prices come from ai_config, never from code.
import type { SupabaseClient } from "@supabase/supabase-js";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const PLAN_RANK: Record<string, number> = { free: 0, growth: 1, business: 2, custom: 3 };
const BUSY = "AI tools are busy right now, please try again tomorrow.";
export const LIVE_FEATURES = ["style_preview", "style_suggestions", "festive_message_ai"];

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };
type GeminiResult = {
  text: string | null;
  image: { mimeType: string; data: string } | null;
  inputTokens: number;
  outputTokens: number;
};

export type AiRunResponse =
  | { ok: true; result: Record<string, unknown>; credits: number; wallet: unknown }
  | {
      ok: false;
      code: string;
      error: string;
      needed?: number;
      wallet?: unknown;
      min_plan?: string;
      refunded?: boolean;
    };

class FriendlyError extends Error {
  usage?: GeminiResult;
  constructor(
    message: string,
    public code: string,
    usage?: GeminiResult,
  ) {
    super(message);
    this.usage = usage;
  }
}

const fail = (code: string, error: string, extra: Record<string, unknown> = {}): AiRunResponse => ({
  ok: false,
  code,
  error,
  ...extra,
});

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

async function downloadAsPart(db: SupabaseClient, path: string): Promise<Part> {
  const { data, error } = await db.storage.from("ai-studio").download(path);
  if (error || !data) throw new FriendlyError("We couldn't open that photo. Please add it again.", "BAD_INPUT");
  const bytes = new Uint8Array(await data.arrayBuffer());
  return { inlineData: { mimeType: data.type || "image/jpeg", data: toBase64(bytes) } };
}

async function callGemini(
  apiKey: string,
  model: string,
  parts: Part[],
  generationConfig: Record<string, unknown>,
): Promise<GeminiResult> {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new FriendlyError("The AI took too long. Your credits were refunded. Please try again.", "TIMEOUT");
    }
    lastStatus = res.status;
    if (res.status >= 500 && attempt === 0) continue;
    if (res.status === 429) throw new FriendlyError(BUSY, "RATE_LIMITED");
    if (!res.ok) {
      console.error("Gemini error", res.status, (await res.text()).slice(0, 500));
      throw new FriendlyError("The AI couldn't finish this. Your credits were refunded.", `HTTP_${res.status}`);
    }
    const data = await res.json();
    const cand = data?.candidates?.[0];
    const outParts: Array<Record<string, unknown>> = cand?.content?.parts ?? [];
    const text =
      outParts
        .filter((p) => !p.thought)
        .map((p) => (typeof p.text === "string" ? p.text : ""))
        .join("")
        .trim() || null;
    const img = outParts.find((p) => p.inlineData) as
      | { inlineData: { mimeType: string; data: string } }
      | undefined;
    const usage = data?.usageMetadata ?? {};
    const result: GeminiResult = {
      text,
      image: img ? img.inlineData : null,
      inputTokens: Number(usage.promptTokenCount ?? 0),
      outputTokens: Number(usage.candidatesTokenCount ?? 0),
    };
    const finish = String(cand?.finishReason ?? "");
    if (data?.promptFeedback?.blockReason || /SAFETY|PROHIBITED|BLOCK|RECITATION/.test(finish)) {
      throw new FriendlyError(
        "The AI couldn't make this one. Try a different photo or description. Your credits were refunded.",
        "SAFETY",
        result,
      );
    }
    return result;
  }
  throw new FriendlyError("The AI couldn't finish this. Your credits were refunded.", `HTTP_${lastStatus}`);
}

function parseJson(text: string | null): unknown {
  if (!text) return null;
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export async function runAiFeature(opts: {
  userId: string;
  storeId: string;
  feature: string;
  input: Record<string, unknown>;
}): Promise<AiRunResponse> {
  const { userId, storeId, feature, input } = opts;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as SupabaseClient;

  // 1. Access
  const { data: member } = await db
    .from("store_members")
    .select("role, status")
    .eq("store_id", storeId)
    .eq("user_id", userId)
    .maybeSingle();
  const { data: store } = await db
    .from("stores")
    .select("name, ai_staff_allowed")
    .eq("id", storeId)
    .maybeSingle();
  if (!member || member.status !== "active" || !store) return fail("FORBIDDEN", "You don't have access to this shop.");
  if (member.role === "tailor" && !store.ai_staff_allowed) {
    return fail("STAFF_BLOCKED", "Your shop owner hasn't turned on AI tools for staff.");
  }

  // 2. Feature + plan
  const { data: cfgRows } = await db.from("ai_config").select("key, value");
  const config: Record<string, unknown> = {};
  for (const row of cfgRows ?? []) config[row.key as string] = row.value;
  const { data: cost } = await db.from("ai_feature_costs").select("*").eq("feature_key", feature).maybeSingle();
  if (!cost) return fail("UNKNOWN_FEATURE", "This AI tool isn't available.");
  if (config.ai_enabled === false || !cost.enabled) {
    return fail("DISABLED", "This AI tool is switched off for now. Please try again later.");
  }
  if (!LIVE_FEATURES.includes(feature)) return fail("NOT_READY", "This AI tool is coming soon.");
  const { data: planCode } = await db.rpc("effective_plan_code", { _store_id: storeId });
  const minPlan = String(cost.min_plan);
  if ((PLAN_RANK[String(planCode)] ?? 0) < (PLAN_RANK[minPlan] ?? 0)) {
    return fail("PLAN", `Available on ${minPlan[0]!.toUpperCase()}${minPlan.slice(1)}.`, { min_plan: minPlan });
  }
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) return fail("NOT_CONFIGURED", "AI tools aren't switched on yet. Please try again later.");

  // Validate inputs before reserving anything
  const ownPath = (p: string) => p === "" || (p.startsWith(`${storeId}/inputs/`) && !p.includes(".."));
  const fabricPath = str(input.fabricPath, 300);
  const referencePath = str(input.referencePath, 300);
  if (!ownPath(fabricPath) || !ownPath(referencePath)) return fail("BAD_INPUT", "That photo doesn't belong to this shop.");
  if ((feature === "style_preview" || feature === "style_suggestions") && !fabricPath) {
    return fail("BAD_INPUT", "Please add a fabric photo first.");
  }
  let orderId: string | null = str(input.orderId, 64) || null;
  if (orderId) {
    const { data: o } = await db.from("orders").select("id").eq("id", orderId).eq("store_id", storeId).maybeSingle();
    if (!o) orderId = null;
  }
  let adjustPath = "";
  const adjustFrom = str(input.adjustFromPreviewId, 64);
  if (adjustFrom) {
    const { data: prev } = await db
      .from("ai_style_previews")
      .select("image_path")
      .eq("id", adjustFrom)
      .eq("store_id", storeId)
      .maybeSingle();
    adjustPath = (prev?.image_path as string | undefined) ?? "";
  }

  // 3. Daily caps
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const { data: todayRows } = await db
    .from("ai_ledger")
    .select("est_cost_usd")
    .gte("created_at", dayStart.toISOString());
  const spentToday = (todayRows ?? []).reduce((s, r) => s + Number(r.est_cost_usd ?? 0), 0);
  if (spentToday >= Number(config.global_daily_cap_usd ?? 10)) return fail("BUSY", BUSY);
  const { data: storeToday } = await db
    .from("ai_ledger")
    .select("credits")
    .eq("store_id", storeId)
    .neq("status", "refunded")
    .gte("created_at", dayStart.toISOString());
  const creditsToday = (storeToday ?? []).reduce((s, r) => s + Number(r.credits ?? 0), 0);
  if (creditsToday + Number(cost.credits) > Number(config.store_daily_credit_cap ?? 60)) return fail("BUSY", BUSY);

  // 4. Reserve
  const { data: reserve, error: reserveErr } = await db.rpc("reserve_ai_credits", {
    p_store_id: storeId,
    p_feature_key: feature,
    p_user_id: userId,
  });
  if (reserveErr) {
    console.error("reserve failed", reserveErr);
    return fail("ERROR", "Something went wrong. Please try again.");
  }
  const r = reserve as { ok: boolean; ledger_id?: string; needed?: number; wallet?: unknown };
  if (!r.ok) {
    return fail("INSUFFICIENT_CREDITS", "You don't have enough AI credits.", { needed: r.needed, wallet: r.wallet });
  }
  const ledgerId = r.ledger_id!;
  const isImage = cost.model_key === "model_image";
  const model = String(config[cost.model_key as string] ?? (isImage ? "gemini-3.1-flash-image" : "gemini-3.1-flash-lite"));
  const costOf = (g: GeminiResult) =>
    (g.inputTokens / 1e6) * Number(config.price_text_input_per_m_usd ?? 0) +
    (isImage
      ? Number(config.price_image_usd ?? 0)
      : (g.outputTokens / 1e6) * Number(config.price_text_output_per_m_usd ?? 0));

  try {
    let result: Record<string, unknown>;
    let g: GeminiResult;
    const garment = str(input.garmentType, 60) || "outfit";
    const occasion = str(input.occasion, 80);
    const gender = str(input.gender, 10) === "male" ? "male" : "female";

    if (feature === "style_preview") {
      const description = str(input.description, 500);
      const tweak = str(input.tweak, 300);
      const prompt = [
        `Create one realistic fashion photo of a ${gender} ${garment}${occasion ? ` for ${occasion}` : ""}, sewn by a skilled Nigerian tailor.`,
        description ? `Style: ${description}.` : "",
        "The garment must be made from EXACTLY the fabric in the first photo: keep its pattern, colours, scale and texture faithful.",
        "Show it on a faceless mannequin, or a model cropped so no face is visible. Plain light studio background. Portrait framing, whole garment visible.",
        "Realistic Nigerian tailoring, fit and finishing. No faces, no brand logos, no text, no watermarks.",
        referencePath ? "The second photo is a style reference from the tailor; follow its cut and silhouette." : "",
        adjustPath ? `The last photo is the previous preview. Keep it the same except: ${tweak || "small refinements"}.` : "",
      ]
        .filter(Boolean)
        .join(" ");
      const parts: Part[] = [{ text: prompt }, await downloadAsPart(db, fabricPath)];
      if (referencePath) parts.push(await downloadAsPart(db, referencePath));
      if (adjustPath) parts.push(await downloadAsPart(db, adjustPath));
      g = await callGemini(apiKey, model, parts, {
        responseModalities: ["IMAGE"],
        imageConfig: { aspectRatio: "3:4", imageSize: "1K" },
      });
      if (!g.image) throw new FriendlyError("The AI didn't return a picture. Your credits were refunded.", "NO_IMAGE", g);
      const id = crypto.randomUUID();
      const ext = g.image.mimeType.includes("jpeg") ? "jpg" : "png";
      const path = `${storeId}/previews/${id}.${ext}`;
      const bytes = Uint8Array.from(atob(g.image.data), (c) => c.charCodeAt(0));
      const up = await db.storage.from("ai-studio").upload(path, bytes, { contentType: g.image.mimeType });
      if (up.error) throw new FriendlyError("We couldn't save the picture. Your credits were refunded.", "STORAGE", g);
      await db.from("ai_style_previews").insert({
        id,
        store_id: storeId,
        order_id: orderId,
        image_path: path,
        fabric_path: fabricPath,
        garment_type: garment,
        description,
        occasion,
        gender,
        created_by: userId,
      });
      const { data: signed } = await db.storage.from("ai-studio").createSignedUrl(path, 3600);
      result = { previewId: id, imageUrl: signed?.signedUrl ?? null, orderId };
    } else if (feature === "style_suggestions") {
      g = await callGemini(
        apiKey,
        model,
        [
          {
            text: `You help a Nigerian tailor. Look at this fabric. Suggest 5 ${gender} ${garment} styles${occasion ? ` for ${occasion}` : ""} that suit this fabric. Reply ONLY with JSON: {"ideas":[{"name":"short name","description":"one plain sentence about the cut and details","why":"one plain sentence on why it suits the occasion"}]}. Use simple English.`,
          },
          await downloadAsPart(db, fabricPath),
        ],
        { responseMimeType: "application/json" },
      );
      const parsed = parseJson(g.text) as { ideas?: Array<Record<string, unknown>> } | null;
      const ideas = (parsed?.ideas ?? [])
        .slice(0, 5)
        .map((i) => ({ name: str(i.name, 80), description: str(i.description, 300), why: str(i.why, 300) }))
        .filter((i) => i.name);
      if (ideas.length === 0) throw new FriendlyError("The AI didn't give usable ideas. Your credits were refunded.", "BAD_OUTPUT", g);
      result = { ideas };
    } else {
      const langIn = str(input.language, 20);
      const language = ["English", "Pidgin", "Yoruba", "Hausa", "Igbo"].includes(langIn) ? langIn : "English";
      const tone = str(input.tone, 20) === "formal" ? "formal" : "friendly";
      const occasionLabel = str(input.occasionLabel, 80) || "the festive season";
      g = await callGemini(
        apiKey,
        model,
        [
          {
            text: `Write one short, warm WhatsApp message (max 60 words) from a tailoring shop called "${str(store.name, 80)}" to a past client ahead of ${occasionLabel}. Invite them to book their outfit early. Tone: ${tone}. Language: ${language}. Start with a greeting that uses the placeholder {first_name} exactly as written. No hashtags, no prices, no links. Reply with the message text only.`,
          },
        ],
        {},
      );
      const message = (g.text ?? "").slice(0, 700);
      if (!message) throw new FriendlyError("The AI didn't write a message. Your credits were refunded.", "BAD_OUTPUT", g);
      result = { message: message.includes("{first_name}") ? message : `Hello {first_name}, ${message}` };
    }

    await db.rpc("charge_ai_credits", {
      p_ledger_id: ledgerId,
      p_usage: { model, input_tokens: g.inputTokens, output_tokens: g.outputTokens, cost_usd: costOf(g) },
    });
    return { ok: true, result, credits: Number(cost.credits), wallet: null };
  } catch (err) {
    const friendly = err instanceof FriendlyError ? err : null;
    if (!friendly) console.error("ai-run failure", err);
    await db.rpc("refund_ai_credits", {
      p_ledger_id: ledgerId,
      p_reason: friendly?.code ?? "ERROR",
      p_usage: friendly?.usage ? { model, cost_usd: costOf(friendly.usage) } : { model },
    });
    return fail(friendly?.code ?? "ERROR", friendly?.message ?? "Something went wrong. Your credits were refunded.", {
      refunded: true,
    });
  }
}
