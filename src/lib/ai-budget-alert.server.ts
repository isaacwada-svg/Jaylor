// Fired after every ai_ledger-affecting AI call (store-wallet features via
// ai-run.server.ts, and guest AI designs). Mirrors the dedup pattern
// supabase/functions/_shared/ai-gateway.ts already uses for the old,
// now-unused System A budget (an app_settings row claims each threshold
// once per month) -- kept under a distinct key prefix so the two don't
// collide, since System A's own budget alerting is untouched and could in
// principle still fire if something ever called it again.
import type { SupabaseClient } from "@supabase/supabase-js";

const KEY_PREFIX = "ai_wallet_budget_alert";

export async function maybeAlertAiWalletBudget(db: SupabaseClient): Promise<void> {
  try {
    const { data: cfgRows } = await db
      .from("ai_config")
      .select("key, value")
      .eq("key", "monthly_budget_usd")
      .maybeSingle();
    const budgetUsd = Number((cfgRows as { value?: unknown } | null)?.value ?? 30);
    if (!(budgetUsd > 0)) return;

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const { data: rows } = await db
      .from("ai_ledger")
      .select("est_cost_usd")
      .gte("created_at", monthStart.toISOString());
    const spentUsd = (rows ?? []).reduce(
      (sum: number, r: { est_cost_usd: number | null }) => sum + Number(r.est_cost_usd ?? 0),
      0,
    );
    const pctUsed = spentUsd / budgetUsd;
    const crossed = pctUsed >= 1 ? 100 : pctUsed >= 0.8 ? 80 : null;
    if (crossed === null) return;

    const month = new Date().toISOString().slice(0, 7);
    const key = `${KEY_PREFIX}_${crossed}_${month}`;
    const { data: existing } = await db
      .from("app_settings")
      .select("key")
      .eq("key", key)
      .maybeSingle();
    if (existing) return;
    const { error } = await db
      .from("app_settings")
      .insert({ key, value: new Date().toISOString() });
    if (error) return; // another concurrent call already claimed this alert

    await db.functions
      .invoke("notify-admin-budget", { body: { threshold: crossed, pctUsed } })
      .catch(() => {});
  } catch {
    // Best-effort -- never let the budget alert check break the AI call it followed.
  }
}
