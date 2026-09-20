import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/jaylor/app-shell";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { TierBadge } from "@/components/jaylor/tier-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store-context";
import { useFeature } from "@/lib/use-feature";
import { effectiveTier, planCodeToTier } from "@/lib/jaylor";

export const Route = createFileRoute("/_authenticated/billing")({
  staticData: { sitemap: false },
  head: () => ({ meta: [{ title: "Billing — Jaylor" }] }),
  component: Billing,
});

function Billing() {
  const { currentStore } = useStore();
  const tier = effectiveTier(currentStore);
  const inTrial = !!currentStore && new Date(currentStore.trial_ends_at) > new Date();

  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ["plans"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plans").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: ordersFeature } = useFeature(currentStore?.id, "orders");
  const { data: messagesFeature } = useFeature(currentStore?.id, "whatsapp_auto");

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-6 lg:px-8 lg:py-10">
        <h1 className="text-3xl">Billing</h1>
        <StitchDivider className="my-6" />

        <Card className="rounded-2xl">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                  Current plan
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <TierBadge tier={tier} />
                  {inTrial && <span className="text-xs text-muted-foreground">(free trial)</span>}
                </div>
              </div>
              <Button size="sm" onClick={() => toast("Billing isn't set up yet — coming soon")}>
                Upgrade
              </Button>
            </div>

            {inTrial && currentStore && (
              <p className="mt-3 text-sm text-muted-foreground">
                Your Growth trial ends {new Date(currentStore.trial_ends_at).toLocaleDateString()}.
                Afterwards you&apos;ll move to Free unless you subscribe — all your data stays
                exactly as it is.
              </p>
            )}

            <div className="mt-4 space-y-3 border-t border-border pt-4">
              {ordersFeature && (
                <UsageMeter
                  label="Orders this month"
                  used={ordersFeature.used}
                  limit={ordersFeature.limit}
                />
              )}
              {messagesFeature && (
                <UsageMeter
                  label="Automatic WhatsApp messages"
                  used={messagesFeature.used}
                  limit={messagesFeature.limit}
                />
              )}
            </div>
          </CardContent>
        </Card>

        <h2 className="mt-8 text-xl">Plans</h2>
        {plansLoading ? (
          <div className="mt-3 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {(plans ?? []).map((plan) => {
              const isCurrent = !inTrial && plan.code === currentStore?.plan_code;
              const isTrialPlan = inTrial && plan.code === "growth";
              return (
                <Card
                  key={plan.code}
                  className={isCurrent || isTrialPlan ? "rounded-2xl border-gold" : "rounded-2xl"}
                >
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{plan.name}</p>
                        {(isCurrent || isTrialPlan) && (
                          <TierBadge tier={planCodeToTier(plan.code)} />
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {plan.price_quarterly
                          ? `₦${plan.price_quarterly.toLocaleString()} / quarter`
                          : plan.code === "free"
                            ? "Free"
                            : "By quote"}
                      </p>
                    </div>
                    {!isCurrent && !isTrialPlan && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toast("Billing isn't set up yet — coming soon")}
                      >
                        Choose
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function UsageMeter({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number | boolean | null;
}) {
  const numericLimit = typeof limit === "number" ? limit : null;
  const unlimited = numericLimit === null || numericLimit < 0;
  const percent = unlimited ? 0 : Math.min(100, (used / Math.max(numericLimit, 1)) * 100);

  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="figures">
          {unlimited ? `${used} · unlimited` : `${used} / ${numericLimit}`}
        </span>
      </div>
      {!unlimited && <Progress value={percent} className="mt-1.5" />}
    </div>
  );
}
