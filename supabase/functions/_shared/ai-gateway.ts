// The single AI gateway every edge function's AI call goes through: gates on
// plan quota, per-store rate limit and the global monthly budget, caches
// identical requests for 90 days, and logs actual token counts + cost to
// usage_log. See _shared/ai.ts for the raw model call this wraps.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI, callAnthropic, type ChatMessage, type AiUsage } from "./ai.ts";

type SupabaseClient = ReturnType<typeof createClient>;

// Mirrors src/lib/fx.ts's APPROX_USD_NGN_RATE — edge functions run in a
// separate Deno runtime and can't import from src/, so this is kept in sync
// by hand, same as _shared/plan.ts mirrors src/lib/pricing-content.ts.
const APPROX_USD_NGN_RATE = 1600;

export type AiFeatureKey = "voice_entry" | "ai_replies" | "style_cards" | "advisor_messages";

/** Feature keys allowed to keep running once the monthly budget hits 100% (paid plans only). */
const ALWAYS_ON_AT_FULL_BUDGET = new Set<AiFeatureKey>(["voice_entry"]);

type TaskConfig = {
  model: string;
  json: boolean;
  /** Whether identical requests for this task are safe to serve from cache. */
  cacheable: boolean;
  /**
   * "anthropic" calls Claude directly (billed to this project's own
   * Anthropic account, not Lovable's AI Gateway credits). Only tasks that
   * are pure text can use it: Claude's API takes neither audio input
   * (voice_entry) nor produces image output (style_cards), so those two
   * stay on "lovable" regardless of cost.
   */
  provider: "lovable" | "anthropic";
};

// Centralised, short config per AI task — never inline a model name or
// response-shape decision at the call site. Model IDs are the ones already
// verified working against the Lovable AI Gateway (or Anthropic) in this
// project; swapping in a smaller/cheaper model per task is a config-only
// change here.
const TASK_CONFIG: Record<AiFeatureKey, TaskConfig> = {
  voice_entry: { model: "google/gemini-2.5-flash", json: true, cacheable: false, provider: "lovable" },
  ai_replies: {
    model: "claude-haiku-4-5-20251001",
    json: false,
    cacheable: false,
    provider: "anthropic",
  },
  style_cards: {
    model: "google/gemini-2.5-flash-image-preview",
    json: false,
    cacheable: false,
    provider: "lovable",
  },
  advisor_messages: {
    model: "claude-haiku-4-5-20251001",
    json: false,
    cacheable: false,
    provider: "anthropic",
  },
};

/**
 * Per-plan model override for the Business Advisor, so upgrading a tier's
 * model later is a config-only change here rather than touching call sites.
 * Every tier currently points at Haiku (the cheapest Claude model) to keep
 * runtime AI cost as low as possible — raise growth/business to a
 * stronger Claude model once cost headroom allows it.
 */
const ADVISOR_MODEL_BY_PLAN: Record<string, string> = {
  free: "claude-haiku-4-5-20251001",
  growth: "claude-haiku-4-5-20251001",
  business: "claude-haiku-4-5-20251001",
  custom: "claude-haiku-4-5-20251001",
};

export function advisorModelForPlan(planCode: string | null | undefined): string {
  return ADVISOR_MODEL_BY_PLAN[planCode ?? "free"] ?? ADVISOR_MODEL_BY_PLAN.free;
}

// Rough $/1M-token estimate per model, for the usage_log's estimated cost
// columns — not an authoritative invoice figure, same spirit as the
// pre-existing estimated_cost_usd/ngn columns this reuses.
const MODEL_COST_PER_1M_TOKENS: Record<string, { input: number; output: number }> = {
  "google/gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "google/gemini-2.5-flash-image-preview": { input: 0.3, output: 30 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
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

function estimateCostUsd(
  model: string,
  usage: { prompt_tokens?: number; completion_tokens?: number } | undefined,
) {
  const rates =
    MODEL_COST_PER_1M_TOKENS[model] ?? MODEL_COST_PER_1M_TOKENS["google/gemini-2.5-flash"];
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
    const { data: existing } = await supabase
      .from("app_settings")
      .select("key")
      .eq("key", key)
      .maybeSingle();
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
  opts?: { bypassPlanLimit?: boolean },
): Promise<GatewayGate> {
  if (!opts?.bypassPlanLimit) {
    const { data: limitCheck } = await supabase.rpc("check_feature_limit", {
      p_store_id: storeId,
      p_feature: featureKey,
      p_quantity: 1,
    });
    const limit = limitCheck as { allowed?: boolean } | null;
    if (limit && limit.allowed === false) {
      return {
        allowed: false,
        reason: "You've used all of this month's AI credits on your plan. Upgrade for more.",
      };
    }
  }

  const { data: planCode } = await supabase.rpc("effective_plan_code", { _store_id: storeId });
  const { data: plan } = await supabase
    .from("plans")
    .select("limits")
    .eq("code", planCode ?? "free")
    .maybeSingle();
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
    return {
      allowed: false,
      reason: "Today's AI request limit reached for your plan — try again tomorrow.",
    };
  }

  const budget = await getBudgetState(supabase);
  maybeAlertAdmin(supabase, budget.pctUsed);
  if (budget.pctUsed >= 1) {
    if (planCode === "free" || !ALWAYS_ON_AT_FULL_BUDGET.has(featureKey)) {
      return {
        allowed: false,
        reason:
          "AI features are paused for this month while we manage server costs — back next month.",
      };
    }
  } else if (budget.pctUsed >= 0.8 && planCode === "free") {
    return {
      allowed: false,
      reason:
        "AI features are paused for free-plan shops this month — upgrade to keep using them, or check back next month.",
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
  userMessage?: string;
  /** Prior turns of a multi-turn conversation, oldest first. Never cached. */
  history?: { role: "user" | "assistant"; content: string }[];
  /** Paid-plan audio path: a short recording, sent instead of a text transcript. */
  audio?: { base64: string; format: string };
  triggeredByUserAction: boolean;
  /** Skip the plan's monthly quota check (e.g. a time-limited trial window). Rate limits and the global budget still apply. */
  bypassPlanLimit?: boolean;
  /** Overrides TASK_CONFIG's model for this call only (e.g. per-plan model selection). */
  modelOverride?: string;
}): Promise<{ content: string }> {
  if (!opts.triggeredByUserAction) {
    throw new AiGatewayBlockedError("AI features only run on an explicit user action.");
  }

  const gate = await canUseAi(opts.supabase, opts.storeId, opts.featureKey, {
    bypassPlanLimit: opts.bypassPlanLimit,
  });
  if (!gate.allowed) throw new AiGatewayBlockedError(gate.reason);

  const config = {
    ...TASK_CONFIG[opts.featureKey],
    model: opts.modelOverride ?? TASK_CONFIG[opts.featureKey].model,
  };
  const isMultiTurn = (opts.history?.length ?? 0) > 0;
  const normalizedInput = opts.userMessage?.trim().replace(/\s+/g, " ") ?? "";
  // Audio input is never cached — it's effectively unique every time, and hashing
  // a large base64 blob just to guarantee a permanent cache miss isn't worth it.
  const inputHash =
    config.cacheable && !opts.audio && !isMultiTurn
      ? await sha256Hex(`${opts.featureKey}:${opts.systemPrompt}:${normalizedInput}`)
      : null;

  if (config.cacheable && !isMultiTurn && inputHash) {
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

  const userContent: ChatMessage["content"] = opts.audio
    ? [
        {
          type: "text",
          text: normalizedInput || "Listen to this recording and follow the system instructions.",
        },
        {
          type: "input_audio",
          input_audio: { data: opts.audio.base64, format: opts.audio.format },
        },
      ]
    : normalizedInput;
  // Audio always forces the Lovable/Gemini path regardless of config --
  // Claude's API has no audio-input modality, so a misconfigured provider
  // must never silently send a recording somewhere that can't use it.
  const useAnthropic = config.provider === "anthropic" && !opts.audio;

  let content: string;
  let usage: AiUsage;
  if (useAnthropic) {
    const anthropicMessages = [
      ...(opts.history ?? []).map((turn) => ({ role: turn.role, content: turn.content })),
      { role: "user" as const, content: normalizedInput },
    ];
    ({ content, usage } = await callAnthropic(opts.systemPrompt, anthropicMessages, {
      model: config.model,
    }));
  } else {
    const messages: ChatMessage[] = [
      { role: "system", content: opts.systemPrompt },
      ...(opts.history ?? []).map(
        (turn) => ({ role: turn.role, content: turn.content }) as ChatMessage,
      ),
      { role: "user", content: userContent },
    ];
    ({ content, usage } = await callAI(messages, { model: config.model, json: config.json }));
  }
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

  if (config.cacheable && !isMultiTurn && inputHash) {
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
