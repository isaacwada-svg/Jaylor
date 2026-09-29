import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Lock, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store-context";
import { aiRun, confirmAiTopup, startAiTopup } from "@/lib/ai-credits.functions";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type AiWallet = {
  plan_allowance: number;
  allowance_used: number;
  allowance_left: number;
  topup_balance: number;
  topup_expires_at: string | null;
  trial_credits_remaining: number;
  total: number;
  period_start: string;
  period_end: string;
  plan_code: string;
  effective_plan: string;
  staff_allowed: boolean;
};
export type AiFeatureCost = { feature_key: string; label: string; credits: number; enabled: boolean; min_plan: string };
export type AiPack = { id: string; name: string; credits: number; price_ngn: number; active: boolean; sort_order: number };

const PENDING_KEY = "jaylor:ai-pending";
export type PendingAiAction = { feature: string; input: Record<string, unknown> };

export const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;
export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });

export function useAiWallet(storeId: string | undefined) {
  return useQuery({
    queryKey: ["ai-wallet", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await db.rpc("get_ai_wallet", { p_store_id: storeId });
      if (error) throw error;
      return data as AiWallet;
    },
  });
}

export function useAiCosts() {
  return useQuery({
    queryKey: ["ai-costs"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db.from("ai_feature_costs").select("feature_key, label, credits, enabled, min_plan");
      if (error) throw error;
      const map: Record<string, AiFeatureCost> = {};
      for (const row of data as AiFeatureCost[]) map[row.feature_key] = row;
      return map;
    },
  });
}

export function useAiPacks() {
  return useQuery({
    queryKey: ["ai-packs"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db.from("ai_credit_packs").select("*").eq("active", true).order("sort_order");
      if (error) throw error;
      return data as AiPack[];
    },
  });
}

type SheetState = { open: boolean; feature?: string; needed?: number; upgradeOnly?: boolean };
type Ctx = {
  openTopUp: (s?: Omit<SheetState, "open">) => void;
  run: (
    feature: string,
    input: Record<string, unknown>,
  ) => Promise<{ ok: true; result: Record<string, unknown> } | { ok: false }>;
};
const AiCreditsContext = createContext<Ctx | null>(null);

export function useAiCredits(): Ctx {
  const ctx = useContext(AiCreditsContext);
  if (!ctx) throw new Error("useAiCredits must be used inside AiCreditsProvider");
  return ctx;
}

export function takePendingAiAction(): PendingAiAction | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_KEY);
    return JSON.parse(raw) as PendingAiAction;
  } catch {
    return null;
  }
}

export function AiCreditsProvider({ children }: { children: ReactNode }) {
  const { currentStore } = useStore();
  const storeId = currentStore?.id;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const runFn = useServerFn(aiRun);
  const confirmFn = useServerFn(confirmAiTopup);
  const [sheet, setSheet] = useState<SheetState>({ open: false });
  const [lastAction, setLastAction] = useState<PendingAiAction | null>(null);

  const refreshWallet = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["ai-wallet"] });
    void qc.invalidateQueries({ queryKey: ["ai-ledger"] });
  }, [qc]);

  // Returning from Paystack: confirm server-side, then continue the action.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get("reference") ?? params.get("trxref");
    if (!reference || !reference.startsWith("aicredit_")) return;
    const url = new URL(window.location.href);
    ["reference", "trxref", "aicredit"].forEach((k) => url.searchParams.delete(k));
    window.history.replaceState({}, "", url.toString());
    let tries = 0;
    const check = async () => {
      tries++;
      try {
        const res = await confirmFn({ data: { reference } });
        if (res.status === "success") {
          toast.success(`${res.credits} credits added`);
          refreshWallet();
          if (sessionStorage.getItem(PENDING_KEY)) navigate({ to: "/ai-studio", search: { resume: 1 } });
          return;
        }
      } catch {
        // retry below
      }
      if (tries < 6) setTimeout(check, 4000);
      else toast("We're still waiting for Paystack to confirm your payment. Your credits will appear shortly.");
    };
    void check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = useCallback<Ctx["run"]>(
    async (feature, input) => {
      if (!storeId) return { ok: false };
      setLastAction({ feature, input });
      let res;
      try {
        res = await runFn({ data: { storeId, feature, input } });
      } catch {
        toast.error("Something went wrong. Please check your connection and try again.");
        return { ok: false };
      }
      refreshWallet();
      if (res.ok) return { ok: true, result: res.result };
      if (res.code === "INSUFFICIENT_CREDITS") {
        setSheet({ open: true, feature, needed: res.needed });
      } else if (res.code === "PLAN") {
        setSheet({ open: true, feature, upgradeOnly: true });
      } else {
        toast.error(res.error);
      }
      return { ok: false };
    },
    [storeId, runFn, refreshWallet],
  );

  const value = useMemo<Ctx>(
    () => ({ run, openTopUp: (s) => setSheet({ open: true, ...s }) }),
    [run],
  );

  return (
    <AiCreditsContext.Provider value={value}>
      {children}
      <TopUpSheet
        state={sheet}
        onOpenChange={(open) => setSheet((s) => ({ ...s, open }))}
        pendingAction={sheet.feature ? lastAction : null}
      />
    </AiCreditsContext.Provider>
  );
}

function TopUpSheet({
  state,
  onOpenChange,
  pendingAction,
}: {
  state: SheetState;
  onOpenChange: (open: boolean) => void;
  pendingAction: PendingAiAction | null;
}) {
  const { currentStore } = useStore();
  const { data: wallet } = useAiWallet(currentStore?.id);
  const { data: costs } = useAiCosts();
  const { data: packs } = useAiPacks();
  const startFn = useServerFn(startAiTopup);
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const cost = state.feature ? costs?.[state.feature] : undefined;
  const plan = wallet?.plan_code ?? "free";
  const previewCost = costs?.style_preview?.credits ?? 10;

  async function buy(packId: string) {
    if (!currentStore) return;
    setBusy(packId);
    try {
      if (pendingAction) sessionStorage.setItem(PENDING_KEY, JSON.stringify(pendingAction));
      const url = new URL(window.location.href);
      url.search = "";
      url.searchParams.set("aicredit", "1");
      const res = await startFn({ data: { storeId: currentStore.id, packId, callbackUrl: url.toString() } });
      window.location.href = res.authorizationUrl;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start this payment");
      setBusy(null);
    }
  }

  const upgrade =
    plan === "free"
      ? { name: "Growth", price: 6000, credits: 100 }
      : plan === "growth"
        ? { name: "Business", price: 15000, credits: 300 }
        : null;

  return (
    <Sheet open={state.open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="text-2xl">
            {state.upgradeOnly
              ? "Available on Growth"
              : state.needed
                ? "You're out of AI credits for this month"
                : "Top up AI credits"}
          </SheetTitle>
          <SheetDescription>
            {state.needed && cost
              ? `${cost.label} needs ${state.needed} credits. You have ${wallet?.total ?? 0} left.`
              : `You have ${wallet?.total ?? 0} AI credits.`}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-3 px-4 pb-6">
          {!state.upgradeOnly &&
            (packs ?? []).map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={!!busy}
                onClick={() => buy(p.id)}
                className="flex min-h-16 w-full items-center justify-between gap-3 border border-border bg-card px-4 py-3 text-left transition-colors hover:border-gold disabled:opacity-60"
              >
                <span>
                  <span className="block font-medium">
                    {p.name} · {p.credits} credits · {naira(p.price_ngn)}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    About {Math.floor(p.credits / previewCost)} style previews or {p.credits} captions
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-gold">{busy === p.id ? "Opening…" : "Pay"}</span>
              </button>
            ))}
          {upgrade && (
            <div className="border border-gold/60 bg-accent/40 p-4">
              <p className="font-medium">
                {upgrade.name} · {naira(upgrade.price)}/month · {upgrade.credits} credits every month
              </p>
              <Button
                className="mt-3 w-full"
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                  navigate({ to: "/billing" });
                }}
              >
                See {upgrade.name}
              </Button>
            </div>
          )}
          {wallet && wallet.plan_allowance > 0 && (
            <p className="text-sm text-muted-foreground">Your monthly credits reset on {shortDate(wallet.period_end)}.</p>
          )}
          <p className="text-xs text-muted-foreground">Pay by card, bank transfer or USSD. Top-up credits last 12 months.</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** "AI credits: 64" pill for the header and AI Studio. */
export function AiCreditsBadge({ className }: { className?: string }) {
  const { currentStore } = useStore();
  const { data } = useAiWallet(currentStore?.id);
  const navigate = useNavigate();
  if (!data) return null;
  return (
    <button
      type="button"
      onClick={() => navigate({ to: "/ai-studio" })}
      className={cn(
        "inline-flex h-8 items-center gap-1 border border-gold/50 px-2 text-xs font-semibold text-foreground hover:border-gold",
        className,
      )}
      aria-label={`AI credits: ${data.total}. Open AI Studio`}
    >
      <Sparkles className="size-3.5 text-gold" />
      AI credits: {data.total}
    </button>
  );
}

/** Every AI button shows its cost, and locks for free shops that used their trial. */
export function AiActionButton({
  feature,
  label,
  onRun,
  busy,
  ...rest
}: Omit<ButtonProps, "onClick"> & { feature: string; label: string; onRun: () => void; busy?: boolean }) {
  const { currentStore } = useStore();
  const { data: wallet } = useAiWallet(currentStore?.id);
  const { data: costs } = useAiCosts();
  const { openTopUp } = useAiCredits();
  const cost = costs?.[feature]?.credits;
  const locked =
    wallet &&
    cost != null &&
    wallet.effective_plan === "free" &&
    wallet.trial_credits_remaining < cost &&
    wallet.topup_balance < cost;
  if (locked) {
    return (
      <Button {...rest} variant="outline" onClick={() => openTopUp({ feature, upgradeOnly: true })}>
        <Lock className="size-4" /> {label} · Available on Growth
      </Button>
    );
  }
  return (
    <Button {...rest} disabled={busy || rest.disabled} onClick={onRun}>
      <Sparkles className="size-4" />
      {busy ? "Working…" : `${label}${cost != null ? ` · ${cost} credit${cost === 1 ? "" : "s"}` : ""}`}
    </Button>
  );
}
