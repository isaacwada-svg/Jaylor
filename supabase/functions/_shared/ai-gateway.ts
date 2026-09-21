// The single AI gateway every edge function's AI call goes through: gates on
// plan quota, per-store rate limit and the global monthly budget, caches
// identical requests for 90 days, and logs actual token counts + cost to
// usage_log. See _shared/ai.ts for the raw model call this wraps.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI, type ChatMessage } from "./ai.ts";

type SupabaseClient = ReturnType<typeof createClient>;

// Mirrors src/lib/fx.ts's APPROX_USD_NGN_RATE — edge functions run in a
// separate Deno runtime and can't import from src/, so this is kept in sync
// by hand, same as _shared/plan.ts mirrors src/lib/pricing-content.ts.
const APPROX_USD_NGN_RATE = 1600;

export type AiFeatureKey = "voice_entry" | "ai_replies" | "style_cards";

/** Feature keys allowed to keep running once the monthly budget hits 100% (paid plans only). */
const ALWAYS_ON_AT_FULL_BUDGET = new Set<AiFeatureKey>(["voice_entry"]);

type TaskConfig = {
  model: string;
  json: boolean;
  /** Whether identical requests for this task are safe to serve from cache. */
  cacheable: boolean;
};

// Centralised, short config per AI task — never inline a model name or
// response-shape decision at the call site. Model IDs are the ones already
// verified working against the Lovable AI Gateway in this project; swapping
// in a smaller/cheaper model per task is a config-only change here once one
// is confirmed available on the account's gateway plan.
const TASK_CONFIG: Record<AiFeatureKey, TaskConfig> = {
  voice_entry: { model: "google/gemini-2.5-flash", json: true, cacheable: false },
  ai_replies: { model: "google/gemini-2.5-flash", json: false, cacheable: false },
  style_cards: { model: "google/gemini-2.5-flash-image-preview", json: false, cacheable: false },
};

// Rough $/1M-token estimate per model, for the usage_log's estimated cost
// columns — not an authoritative invoice figure, same spirit as the
// pre-existing estimated_cost_usd/ngn columns this reuses.
const MODEL_COST_PER_1M_TOKENS: Record<string, { input: number; output: number }> = {
  "google/gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "google/gemini-2.5-flash-image-preview": { input: 0.3, output: 30 },
};
/** Flat per-call estimate for image generation, which isn't priced by output token. */
const IMAGE_CALL_COST_USD = 0.02;

export class AiGatewayBlockedError extends Error {}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function estimateCostUsd(model: string, usage: { prompt_tokens?: number; completion_tokens?: number } | undefined) {
  const rates = MODEL_COST_PER_1M_TOKENS[model] ?? MODEL_COST_PER_1M_TOKENS["google/gemini-2.5-flash"];
  const input = ((usage?.prompt_tokens ?? 0) / 1_000_000) * rates.input;
  const output = ((usage?.completion_tokens ?? 0) / 1_000_000) * rates.output;
  return input + output;
}

async function getBudgetState(supabase: SupabaseClient) {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const { data: setting } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "ai_monthly_budget_usd")
    .maybeSingle();
  const budgetUsd = Number(setting?.value ?? 200);

  const { data: rows } = await supabase
    .from("usage_log")
    .select("estimated_cost_usd")
    .gte("created_at", monthStart.toISOString());
  const spentUsd = (rows ?? []).reduce(
    (sum: number, r: { estimated_cost_usd: number | null }) => sum + (r.estimated_cost_usd ?? 0),
    0,
  );

  return { budgetUsd, spentUsd, pctUsed: budgetUsd > 0 ? spentUsd / budgetUsd : 0 };
}

/** Fires the admin alert at most once per threshold per calendar month. Never blocks the caller. */
function maybeAlertAdmin(supabase: SupabaseClient, pctUsed: number) {
  void (async () => {
    const month = new Date().toISOString().slice(0, 7);
    const crossed = pctUsed >= 1 ? 100 : pctUsed >= 0.8 ? 80 : null;
    if (crossed === null) return;
    const key = `ai_budget_alert_${crossed}_${month}`;
    const { data: existing } = await supabase.from("app_settings").select("key").eq("key", key).maybeSingle();
    if (existing) return;
    const { error } = await supabase
      .from("app_settings")
      .insert({ key, value: new Date().toISOString() });
    if (error) return; // another concurrent call already claimed this alert
    await supabase.functions
      .invoke("notify-admin-budget", { body: { threshold: crossed, pctUsed } })
      .catch(() => {});
  })();
}

export type GatewayGate = { allowed: true } | { allowed: false; reason: string };

export async function canUseAi(
  supabase: SupabaseClient,
  storeId: string,
  featureKey: AiFeatureKey,
): Promise<GatewayGate> {
  const { data: limitCheck } = await supabase.rpc("check_feature_limit", {
    p_store_id: storeId,
    p_feature: featureKey,
    p_quantity: 1,
  });
  const limit = limitCheck as { allowed?: boolean } | null;
  if (limit && limit.allowed === false) {
    return { allowed: false, reason: "You've used all of this month's AI credits on your plan. Upgrade for more." };
  }

  const { data: planCode } = await supabase.rpc("effective_plan_code", { _store_id: storeId });
  const { data: plan } = await supabase.from("plans").select("limits").eq("code", planCode ?? "free").maybeSingle();
  const limits = (plan?.limits ?? {}) as Record<string, unknown>;
  const perHour = Number(limits.ai_calls_per_hour ?? 20);
  const perDay = Number(limits.ai_calls_per_day ?? 60);

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: hourCount } = await supabase
    .from("usage_log")
    .select("id", { count: "exact", head: true })
    .eq("store_id", storeId)
    .gte("created_at", hourAgo);
  if ((hourCount ?? 0) >= perHour) {
    return { allowed: false, reason: "Too many AI requests this hour — try again shortly." };
  }
  const { count: dayCount } = await supabase
    .from("usage_log")
    .select("id", { count: "exact", head: true })
    .eq("store_id", storeId)
    .gte("created_at", dayAgo);
  if ((dayCount ?? 0) >= perDay) {
    return { allowed: false, reason: "Today's AI request limit reached for your plan — try again tomorrow." };
  }

  const budget = await getBudgetState(supabase);
  maybeAlertAdmin(supabase, budget.pctUsed);
  if (budget.pctUsed >= 1) {
    if (planCode === "free" || !ALWAYS_ON_AT_FULL_BUDGET.has(featureKey)) {
      return {
        allowed: false,
        reason: "AI features are paused for this month while we manage server costs — back next month.",
      };
    }
  } else if (budget.pctUsed >= 0.8 && planCode === "free") {
    return {
      allowed: false,
      reason: "AI features are paused for free-plan shops this month — upgrade to keep using them, or check back next month.",
    };
  }

  return { allowed: true };
}

async function logUsage(
  supabase: SupabaseClient,
  entry: {
    storeId: string;
    userId: string | null;
    featureKey: AiFeatureKey;
    model: string;
    inputTokens: number | null;
    outputTokens: number | null;
    costUsd: number;
    cached: boolean;
    inputHash: string | null;
  },
) {
  await supabase.from("usage_log").insert({
    store_id: entry.storeId,
    user_id: entry.userId,
    feature_key: entry.featureKey,
    quantity: 1,
    estimated_cost_usd: entry.costUsd,
    estimated_cost_ngn: entry.costUsd * APPROX_USD_NGN_RATE,
    model: entry.model,
    input_tokens: entry.inputTokens,
    output_tokens: entry.outputTokens,
    cached: entry.cached,
    input_hash: entry.inputHash,
  });
}

/**
 * Runs one AI-gateway-governed text call. Every edge function that calls an
 * AI model for a user-facing feature should go through this (or, for a
 * feature this doesn't yet cover, at least call canUseAi + logUsage
 * directly) rather than calling _shared/ai.ts's callAI on its own.
 */
export async function runAiGatewayCall(opts: {
  supabase: SupabaseClient;
  storeId: string;
  userId: string | null;
  featureKey: AiFeatureKey;
  systemPrompt: string;
  userMessage: string;
  triggeredByUserAction: boolean;
}): Promise<{ content: string }> {
  if (!opts.triggeredByUserAction) {
    throw new AiGatewayBlockedError("AI features only run on an explicit user action.");
  }

  const gate = await canUseAi(opts.supabase, opts.storeId, opts.featureKey);
  if (!gate.allowed) throw new AiGatewayBlockedError(gate.reason);

  const config = TASK_CONFIG[opts.featureKey];
  const normalizedInput = opts.userMessage.trim().replace(/\s+/g, " ");
  const inputHash = config.cacheable
    ? await sha256Hex(`${opts.featureKey}:${opts.systemPrompt}:${normalizedInput}`)
    : null;

  if (config.cacheable && inputHash) {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: cached } = await opts.supabase
      .from("ai_response_cache")
      .select("output")
      .eq("input_hash", inputHash)
      .gt("created_at", ninetyDaysAgo)
      .maybeSingle();
    if (cached) {
      const content = (cached.output as { content: string }).content;
      await logUsage(opts.supabase, {
        storeId: opts.storeId,
        userId: opts.userId,
        featureKey: opts.featureKey,
        model: config.model,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        cached: true,
        inputHash,
      });
      return { content };
    }
  }

  const messages: ChatMessage[] = [
    { role: "system", content: opts.systemPrompt },
    { role: "user", content: normalizedInput },
  ];
  const { content, usage } = await callAI(messages, { model: config.model, json: config.json });
  const costUsd = estimateCostUsd(config.model, usage);

  await logUsage(opts.supabase, {
    storeId: opts.storeId,
    userId: opts.userId,
    featureKey: opts.featureKey,
    model: config.model,
    inputTokens: usage?.prompt_tokens ?? null,
    outputTokens: usage?.completion_tokens ?? null,
    costUsd,
    cached: false,
    inputHash,
  });

  if (config.cacheable && inputHash) {
    await opts.supabase
      .from("ai_response_cache")
      .upsert({ input_hash: inputHash, feature_key: opts.featureKey, output: { content } });
  }

  return { content };
}

/**
 * For AI calls that don't go through runAiGatewayCall's generic text path
 * (e.g. generate-design's image call, which has its own bespoke payment and
 * rate-limit flow) — still gate on the shared budget and record real cost,
 * so every AI call is accounted for in one place.
 */
export async function gateAndLogImageCall<T>(opts: {
  supabase: SupabaseClient;
  storeId: string;
  userId: string | null;
  featureKey: AiFeatureKey;
  run: () => Promise<T>;
}): Promise<T> {
  const budget = await getBudgetState(opts.supabase);
  maybeAlertAdmin(opts.supabase, budget.pctUsed);
  if (budget.pctUsed >= 1) {
    throw new AiGatewayBlockedError(
      "AI features are paused for this month while we manage server costs — back next month.",
    );
  }

  const result = await opts.run();
  await logUsage(opts.supabase, {
    storeId: opts.storeId,
    userId: opts.userId,
    featureKey: opts.featureKey,
    model: TASK_CONFIG[opts.featureKey].model,
    inputTokens: null,
    outputTokens: null,
    costUsd: IMAGE_CALL_COST_USD,
    cached: false,
    inputHash: null,
  });
  return result;
}
