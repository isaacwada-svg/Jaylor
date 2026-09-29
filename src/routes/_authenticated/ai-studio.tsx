import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { CalendarHeart, Sparkles } from "lucide-react";
import { AppShell } from "@/components/jaylor/app-shell";
import { StylePreviewGallery, StylePreviewPanel, type StyleInputs } from "@/components/jaylor/style-preview-panel";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store-context";
import { shortDate, takePendingAiAction, useAiCosts, useAiCredits, useAiWallet, AiCreditsProvider } from "@/lib/ai-credits";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const Route = createFileRoute("/_authenticated/ai-studio")({
  staticData: { sitemap: false },
  validateSearch: z.object({ resume: z.number().optional() }),
  head: () => ({
    meta: [
      { title: "AI Studio · Jaylor" },
      { name: "description", content: "Style previews from fabric photos, style ideas and festive messages, paid with AI credits." },
      { property: "og:title", content: "AI Studio · Jaylor" },
      { property: "og:description", content: "Jaylor's AI tools for tailors, with clear credit costs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AiStudioPage,
});

const STATUS_WORDS: Record<string, string> = { charged: "Used", refunded: "Refunded", reserved: "In progress" };
const COMING_SOON = ["pricing_advisor", "debt_reminder_ai", "insights_summary", "portfolio_caption"];

function AiStudioPage() {
  return <AiCreditsProvider><AiStudioInner /></AiCreditsProvider>;
}

function AiStudioInner() {
  const { currentStore, currentRole } = useStore();
  const storeId = currentStore?.id;
  const { data: wallet } = useAiWallet(storeId);
  const { data: costs } = useAiCosts();
  const { openTopUp, run } = useAiCredits();
  const qc = useQueryClient();
  const { resume } = Route.useSearch();
  const [resumeInputs, setResumeInputs] = useState<Partial<StyleInputs> | null>(null);

  // After a successful top-up, continue what the tailor was doing.
  useEffect(() => {
    if (!resume) return;
    const pending = takePendingAiAction();
    if (!pending) return;
    if (pending.feature === "style_preview") {
      setResumeInputs(pending.input as Partial<StyleInputs>);
    } else {
      void run(pending.feature, pending.input).then((r) => {
        if (r.ok) toast.success("Done. Open the tool again to see the result.");
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume]);

  const { data: ledger } = useQuery({
    queryKey: ["ai-ledger", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data } = await db
        .from("ai_ledger")
        .select("id, feature_key, credits, status, created_at")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(30);
      return (data ?? []) as { id: string; feature_key: string; credits: number; status: string; created_at: string }[];
    },
  });
  const { data: purchases } = useQuery({
    queryKey: ["ai-ledger", storeId, "purchases"],
    enabled: !!storeId,
    queryFn: async () => {
      const { data } = await db
        .from("ai_topup_purchases")
        .select("id, credits, amount_ngn, status, created_at")
        .eq("store_id", storeId)
        .eq("status", "success")
        .order("created_at", { ascending: false })
        .limit(10);
      return (data ?? []) as { id: string; credits: number; amount_ngn: number; created_at: string }[];
    },
  });

  const lowWarning =
    wallet && wallet.plan_allowance > 0 && wallet.allowance_left <= wallet.plan_allowance * 0.2;

  async function toggleStaff(v: boolean) {
    const { error } = await db.rpc("set_store_ai_staff_allowed", { p_store_id: storeId, p_allowed: v });
    if (error) return void toast.error("Couldn't change this. Please try again.");
    void qc.invalidateQueries({ queryKey: ["ai-wallet"] });
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-6 lg:px-8 lg:py-10">
        <div>
          <p className="text-xs uppercase tracking-[0.1em] text-gold">AI Studio</p>
          <h1 className="mt-1 text-3xl">AI tools for your shop</h1>
          <p className="mt-1 text-sm text-muted-foreground">Every tool shows its cost before you tap. If the AI fails, your credits come back.</p>
        </div>

        <section className="border border-border bg-card p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">AI credits</p>
              <p className="font-display text-5xl">{wallet?.total ?? "–"}</p>
            </div>
            <Button className="h-12" onClick={() => openTopUp()}>Top up credits</Button>
          </div>
          {wallet && (
            <ul className="mt-4 space-y-1 text-sm">
              {wallet.plan_allowance > 0 && (
                <li>Monthly: {wallet.allowance_left} of {wallet.plan_allowance} left · resets on {shortDate(wallet.period_end)}</li>
              )}
              {wallet.trial_credits_remaining > 0 && <li>Trial credits: {wallet.trial_credits_remaining}</li>}
              {wallet.topup_balance > 0 && (
                <li>
                  Top-up: {wallet.topup_balance}
                  {wallet.topup_expires_at ? ` · last until ${shortDate(wallet.topup_expires_at)}` : ""}
                </li>
              )}
            </ul>
          )}
          {lowWarning && (
            <p className="mt-3 border-l-2 border-gold pl-3 text-sm">You have less than 20% of this month's credits left.</p>
          )}
          {currentRole === "owner" && wallet && (
            <label className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4 text-sm">
              <span>Let staff use AI tools</span>
              <Switch checked={wallet.staff_allowed} onCheckedChange={toggleStaff} />
            </label>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="flex items-center gap-2 text-2xl"><Sparkles className="size-5 text-gold" /> Style preview</h2>
          <p className="text-sm text-muted-foreground">Snap the client's fabric and see the outfit before you cut.</p>
          <StylePreviewPanel key={resumeInputs ? "resume" : "new"} {...(resumeInputs ? { initial: resumeInputs } : {})} autoRunPreview={!!resumeInputs} />
          <StylePreviewGallery />
        </section>

        <section className="border border-border p-5">
          <h2 className="flex items-center gap-2 text-2xl"><CalendarHeart className="size-5 text-gold" /> Festive season messages</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            See which clients sewed with you last Christmas, Sallah or Easter, and send them a message. Finding clients is free. Writing with AI costs {costs?.["festive_message_ai"]?.credits ?? 1} credit per campaign.
          </p>
          <Button asChild variant="outline" className="mt-3 h-12"><Link to="/festive">Open festive messages</Link></Button>
        </section>

        <section>
          <h2 className="text-xl">Coming soon</h2>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {COMING_SOON.map((k) => costs?.[k] && (
              <li key={k} className="border border-dashed border-border p-3 text-sm">
                {costs[k]!.label} · {costs[k]!.credits} credit{costs[k]!.credits === 1 ? "" : "s"}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-xl">Credit history</h2>
          <ul className="mt-3 divide-y divide-border border-y border-border text-sm">
            {(purchases ?? []).map((p) => (
              <li key={p.id} className="flex justify-between gap-3 py-3">
                <span>Bought {p.credits} credits · ₦{p.amount_ngn.toLocaleString("en-NG")}</span>
                <span className="text-muted-foreground">{shortDate(p.created_at)}</span>
              </li>
            ))}
            {(ledger ?? []).map((l) => (
              <li key={l.id} className="flex justify-between gap-3 py-3">
                <span>
                  {costs?.[l.feature_key]?.label ?? l.feature_key} · {STATUS_WORDS[l.status] ?? l.status} {l.credits} credit{l.credits === 1 ? "" : "s"}
                  {l.status === "refunded" ? " (given back)" : ""}
                </span>
                <span className="text-muted-foreground">{shortDate(l.created_at)}</span>
              </li>
            ))}
            {(ledger ?? []).length === 0 && (purchases ?? []).length === 0 && (
              <li className="py-3 text-muted-foreground">No AI activity yet.</li>
            )}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
