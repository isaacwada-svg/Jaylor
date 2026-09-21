import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/jaylor/app-shell";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { TierBadge } from "@/components/jaylor/tier-badge";
import { PaymentAccountSettings } from "@/components/jaylor/payment-account-settings";
import { ReferralCard } from "@/components/jaylor/referral-card";
import { MessageTopupButton } from "@/components/jaylor/message-topup-button";
import { StoreProfileSettings } from "@/components/jaylor/store-profile-settings";
import { StoreLocationSettings } from "@/components/jaylor/store-location-settings";
import { GarmentTypeMappingCard } from "@/components/jaylor/garment-type-mapping-card";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store-context";
import { useFeature } from "@/lib/use-feature";
import { useFeatureLimit } from "@/lib/use-feature-limit";
import { useMessageTopups } from "@/lib/use-message-topups";
import { effectiveTier, planCodeToTier } from "@/lib/jaylor";
import { getErrorMessage } from "@/lib/utils";
import { FEATURE_LABELS } from "@/lib/feature-keys";

export const Route = createFileRoute("/_authenticated/billing")({
  staticData: { sitemap: false },
  head: () => ({ meta: [{ title: "Billing — Jaylor" }] }),
  component: Billing,
});

function Billing() {
  const { currentStore } = useStore();
  const tier = effectiveTier(currentStore);
  const inTrial = !!currentStore && new Date(currentStore.trial_ends_at) > new Date();
  const queryClient = useQueryClient();

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
  const { data: itemsFeature } = useFeatureLimit(currentStore?.id, "storefront_items");
  const { data: usersFeature } = useFeatureLimit(currentStore?.id, "users");
  const { data: topupCount } = useMessageTopups(currentStore?.id);
  const messagesLimit =
    typeof messagesFeature?.limit === "number"
      ? messagesFeature.limit + (topupCount ?? 0)
      : messagesFeature?.limit;

  // If the owner returns from a Paystack message top-up.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get("reference") ?? params.get("trxref");
    if (!reference) return;
    window.history.replaceState({}, "", window.location.pathname);

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("verify-message-topup", {
          body: { reference },
        });
        if (error) throw error;
        const status = (data as { status: string }).status;
        if (status === "success") {
          toast.success("Top-up confirmed. 100 messages added to this month's allowance.");
          queryClient.invalidateQueries({ queryKey: ["message-topups", currentStore?.id] });
        } else {
          toast.error("Payment wasn't confirmed");
        }
      } catch (error) {
        toast.error(getErrorMessage(error, "Could not confirm this payment"));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
              <Button size="sm" onClick={() => toast("Plan upgrades aren't available yet")}>
                Upgrade
              </Button>
            </div>

            {inTrial && currentStore && (
              <p className="mt-3 text-sm text-muted-foreground">
                Your Growth trial ends {new Date(currentStore.trial_ends_at).toLocaleDateString()}.
                Afterwards you&apos;ll move to Free unless you subscribe. All your data stays
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
                <div>
                  <UsageMeter
                    label="Automatic WhatsApp messages"
                    used={messagesFeature.used}
                    limit={messagesLimit ?? messagesFeature.limit}
                  />
                  {typeof messagesFeature.limit === "number" && currentStore && (
                    <div className="mt-2">
                      <MessageTopupButton storeId={currentStore.id} />
                    </div>
                  )}
                </div>
              )}
              {itemsFeature && (
                <UsageMeter
                  label={FEATURE_LABELS["storefront_items"] ?? "Storefront items"}
                  used={itemsFeature.used}
                  limit={itemsFeature.limit}
                />
              )}
              {usersFeature && (
                <UsageMeter
                  label={FEATURE_LABELS["users"] ?? "Team members"}
                  used={usersFeature.used}
                  limit={usersFeature.limit}
                />
              )}
            </div>
          </CardContent>
        </Card>

        {currentStore && (
          <div className="mt-6 space-y-6">
            <StoreProfileSettings
              storeId={currentStore.id}
              storeName={currentStore.name}
              logoUrl={currentStore.logo_url}
            />
            <StoreLocationSettings
              storeId={currentStore.id}
              city={currentStore.city}
              state={currentStore.state}
              area={currentStore.area}
              consentBenchmarkSharing={currentStore.consent_benchmark_sharing}
            />
            <GarmentTypeMappingCard storeId={currentStore.id} />
            <PaymentAccountSettings storeId={currentStore.id} tier={tier} />
            <ReferralCard storeId={currentStore.id} referralCode={currentStore.referral_code} />
          </div>
        )}

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
                        onClick={() => toast("Plan upgrades aren't available yet")}
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
