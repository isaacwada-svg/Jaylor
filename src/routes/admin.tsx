import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { LogoMark } from "@/components/jaylor/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { formatMoney, planCodeToTier } from "@/lib/jaylor";
import { TierBadge } from "@/components/jaylor/tier-badge";
import { getErrorMessage } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  staticData: { sitemap: false },
  ssr: false,
  head: () => ({ meta: [{ title: "Platform admin — Jaylor" }] }),
  component: Admin,
});

type StoreRow = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  plan_code: string;
  effective_plan: string;
  trial_ends_at: string;
  is_active: boolean;
  created_at: string;
};

type Stats = {
  total_stores: number;
  new_stores_30d: number;
  trials_ending_7d: number;
  active_this_week: number;
  stores_by_plan: Record<string, number>;
  mrr_estimate: number;
};

// Admin RPCs that exist in the database but aren't in the generated Database types yet.
const rpcAdmin = supabase.rpc as unknown as (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

type PlanRow = {
  code: string;
  name: string;
  currency: string;
  price_monthly: number | null;
  price_quarterly: number | null;
  limits: Json;
  features: Json;
  sort_order: number;
};

type AuditRow = {
  id: string;
  store_id: string | null;
  store_name: string | null;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

type AnalyticsData = {
  period_start: string;
  visitor_count: number;
  signup_count: number;
  visitor_to_signup_rate: number | null;
  store_signup_count: number;
  activated_store_count: number;
  signup_to_first_order_rate: number | null;
  week4_eligible_count: number;
  week4_active_count: number;
  week4_active_rate: number | null;
  trials_ended_count: number;
  trial_converted_count: number;
  trial_to_paid_rate: number | null;
  paying_shop_count: number;
  whatsapp_cost_ngn: number;
  whatsapp_cost_per_paying_shop: number | null;
  monthly_money_collected: { month: string; amount: number }[];
  rate_assumptions: {
    reviewed_on: string;
    usd_ngn: number;
    utility_usd: number;
    marketing_usd: number;
    growth_allowance: number;
    business_allowance: number;
  };
};

function Admin() {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        navigate({ to: "/auth" });
        return;
      }
      setSignedIn(true);
      setAuthChecked(true);
    });
  }, [navigate]);

  const { data: isAdmin, isLoading: adminCheckLoading } = useQuery({
    queryKey: ["is-platform-admin"],
    enabled: signedIn,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_platform_admin");
      if (error) throw error;
      return data;
    },
  });

  if (!authChecked || adminCheckLoading) {
    return <div className="min-h-screen bg-background" />;
  }

  if (!isAdmin) {
    return (
      <main className="linen flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
        <h1 className="text-xl">You don&apos;t have access to this page</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This area is for Bethjay platform staff only.
        </p>
        <Button asChild className="mt-6" variant="outline">
          <Link to="/dashboard">Back to your workroom</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="linen min-h-screen bg-background">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4 lg:px-8">
          <div className="flex items-center gap-2">
            <LogoMark className="size-8" />
            <span className="font-heading text-lg">Platform admin</span>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/dashboard">Exit admin</Link>
          </Button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl px-4 py-6 lg:px-8 lg:py-10">
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="plans">Plans</TabsTrigger>
            <TabsTrigger value="messaging">Messaging</TabsTrigger>
            <TabsTrigger value="leads">Leads</TabsTrigger>
            <TabsTrigger value="audit">Audit log</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            <OverviewTab />
          </TabsContent>
          <TabsContent value="analytics" className="mt-6">
            <AnalyticsTab />
          </TabsContent>
          <TabsContent value="plans" className="mt-6">
            <PlansTab />
          </TabsContent>
          <TabsContent value="messaging" className="mt-6">
            <MessagingTab />
          </TabsContent>
          <TabsContent value="leads" className="mt-6">
            <LeadsTab />
          </TabsContent>
          <TabsContent value="audit" className="mt-6">
            <AuditTab />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

function AnalyticsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-growth-analytics"],
    queryFn: async () => {
      const { data, error } = await rpcAdmin("admin_growth_analytics", { p_months: 12 });
      if (error) throw error;
      return data as AnalyticsData;
    },
  });

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-32 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (!data) return <p className="text-sm text-muted-foreground">Analytics are unavailable.</p>;

  const metrics = [
    {
      label: "Visitor to sign-up",
      value: data.visitor_to_signup_rate,
      suffix: "%",
      target: "3–8%",
      detail: `${data.signup_count} sign-ups from ${data.visitor_count} visitors`,
      healthy: (value: number) => value >= 3 && value <= 8,
    },
    {
      label: "First order in 24 hours",
      value: data.signup_to_first_order_rate,
      suffix: "%",
      target: "60%+",
      detail: `${data.activated_store_count} of ${data.store_signup_count} shops`,
      healthy: (value: number) => value >= 60,
    },
    {
      label: "Week-4 active shops",
      value: data.week4_active_rate,
      suffix: "%",
      target: "40%+",
      detail: `${data.week4_active_count} of ${data.week4_eligible_count} eligible shops`,
      healthy: (value: number) => value >= 40,
    },
    {
      label: "Trial to paid",
      value: data.trial_to_paid_rate,
      suffix: "%",
      target: "15–25%",
      detail: `${data.trial_converted_count} of ${data.trials_ended_count} ended trials`,
      healthy: (value: number) => value >= 15 && value <= 25,
    },
    {
      label: "WhatsApp cost / paying shop",
      value: data.whatsapp_cost_per_paying_shop,
      suffix: "",
      target: "Under 20% of plan price",
      detail: `${formatMoney(data.whatsapp_cost_ngn)} total · ${data.paying_shop_count} paying shops`,
      healthy: () => true,
      money: true,
    },
  ];

  const latestMoney = data.monthly_money_collected.at(-1)?.amount ?? 0;
  const previousMoney = data.monthly_money_collected.at(-2)?.amount ?? 0;
  const moneyGrowing = latestMoney > previousMoney;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl">Launch health</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Since {new Date(data.period_start).toLocaleDateString()} · healthy early targets shown
            below
          </p>
        </div>
        <Badge variant="outline">First-party data</Badge>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map((metric) => {
          const metricValue = metric.value;
          const hasValue = metricValue !== null;
          const healthy = metricValue !== null && metric.healthy(metricValue);
          return (
            <Card key={metric.label} className="rounded-2xl">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium">{metric.label}</p>
                  <Badge variant={healthy ? "default" : "outline"}>{metric.target}</Badge>
                </div>
                <p className="figures mt-4 text-3xl font-semibold">
                  {metricValue === null
                    ? "—"
                    : metric.money
                      ? formatMoney(metricValue)
                      : `${metricValue}${metric.suffix}`}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {hasValue ? metric.detail : "Not enough data yet"}
                </p>
              </CardContent>
            </Card>
          );
        })}

        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium">Money collected</p>
              <Badge variant={moneyGrowing ? "default" : "outline"}>Growing monthly</Badge>
            </div>
            <p className="figures mt-4 text-3xl font-semibold">{formatMoney(latestMoney)}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {data.monthly_money_collected.length > 1
                ? `${moneyGrowing ? "Up" : "Not up"} from ${formatMoney(previousMoney)} last month`
                : "A second month is needed for a trend"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 border-t border-border pt-6">
        <h3 className="text-lg">WhatsApp rate guardrail</h3>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Reviewed {new Date(data.rate_assumptions.reviewed_on).toLocaleDateString()}. Working Meta
          rates for Nigeria are ${data.rate_assumptions.utility_usd.toFixed(4)} per delivered
          utility message and ${data.rate_assumptions.marketing_usd.toFixed(4)} per delivered
          marketing message, before provider markup and exchange-rate movement. Launch allowances
          are {data.rate_assumptions.growth_allowance} for Growth and{" "}
          {data.rate_assumptions.business_allowance} for Business; marketing campaigns are excluded.
        </p>
      </div>
    </div>
  );
}

function OverviewTab() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_platform_stats");
      if (error) throw error;
      return data as unknown as Stats;
    },
  });

  const { data: stores, isLoading: storesLoading } = useQuery({
    queryKey: ["admin-stores"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_stores");
      if (error) throw error;
      return data as unknown as StoreRow[];
    },
  });

  return (
    <div>
      {statsLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : stats ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Total stores" value={String(stats.total_stores)} />
          <Stat label="New in 30 days" value={String(stats.new_stores_30d)} />
          <Stat label="Trials ending in 7 days" value={String(stats.trials_ending_7d)} />
          <Stat label="Active this week" value={String(stats.active_this_week)} />
          <Stat label="Estimated MRR" value={formatMoney(stats.mrr_estimate)} />
          {Object.entries(stats.stores_by_plan).map(([plan, count]) => (
            <Stat key={plan} label={`On ${planCodeToTier(plan)}`} value={String(count)} />
          ))}
        </div>
      ) : null}

      <h2 className="mt-8 text-xl">Stores</h2>
      {storesLoading ? (
        <div className="mt-3 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {(stores ?? []).map((store) => (
            <div
              key={store.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{store.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  jaylor.ng/{store.slug} {store.city ? `· ${store.city}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <TierBadge tier={planCodeToTier(store.effective_plan)} />
                {!store.is_active && <Badge variant="outline">Inactive</Badge>}
                <span className="text-xs text-muted-foreground">
                  {new Date(store.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
        <p className="figures mt-2 text-xl">{value}</p>
      </CardContent>
    </Card>
  );
}

function PlansTab() {
  const queryClient = useQueryClient();
  const [editingPlan, setEditingPlan] = useState<PlanRow | null>(null);
  const [priceMonthly, setPriceMonthly] = useState("");
  const [priceQuarterly, setPriceQuarterly] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: plans, isLoading } = useQuery({
    queryKey: ["admin-plans"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plans").select("*").order("sort_order");
      if (error) throw error;
      return data as unknown as PlanRow[];
    },
  });

  function openEdit(plan: PlanRow) {
    setEditingPlan(plan);
    setPriceMonthly(plan.price_monthly != null ? String(plan.price_monthly) : "");
    setPriceQuarterly(plan.price_quarterly != null ? String(plan.price_quarterly) : "");
  }

  async function savePlan() {
    if (!editingPlan) return;
    setBusy(true);
    try {
      const { error } = await rpcAdmin("admin_update_plan", {
        p_code: editingPlan.code,
        p_name: editingPlan.name,
        p_price_monthly: priceMonthly.trim() ? Number(priceMonthly) : null,
        p_price_quarterly: priceQuarterly.trim() ? Number(priceQuarterly) : null,
        p_limits: editingPlan.limits,
        p_features: editingPlan.features,
      });
      if (error) throw error;
      toast.success("Plan updated");
      setEditingPlan(null);
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not update this plan"));
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {(plans ?? []).map((plan) => (
        <div
          key={plan.code}
          className="flex items-center justify-between gap-3 rounded-xl border border-border p-4"
        >
          <div>
            <p className="font-medium">{plan.name}</p>
            <p className="text-sm text-muted-foreground">
              {plan.price_monthly ? `${formatMoney(plan.price_monthly)}/mo` : "—"}
              {plan.price_quarterly ? ` · ${formatMoney(plan.price_quarterly)}/quarter` : ""}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => openEdit(plan)}>
            Edit
          </Button>
        </div>
      ))}

      <Dialog open={!!editingPlan} onOpenChange={(open) => !open && setEditingPlan(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {editingPlan?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="plan-monthly">Monthly price (₦)</Label>
              <Input
                id="plan-monthly"
                type="number"
                value={priceMonthly}
                onChange={(e) => setPriceMonthly(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-quarterly">Quarterly price (₦)</Label>
              <Input
                id="plan-quarterly"
                type="number"
                value={priceQuarterly}
                onChange={(e) => setPriceQuarterly(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPlan(null)}>
              Cancel
            </Button>
            <Button onClick={savePlan} disabled={busy}>
              {busy ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type MessageUsageRow = {
  store_id: string;
  store_name: string;
  plan_code: string;
  message_count: number;
  cost_ngn: number;
  plan_limit: number | null;
};

function MessagingTab() {
  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin-message-usage"],
    queryFn: async () => {
      const { data, error } = await rpcAdmin("admin_store_message_usage", {});
      if (error) throw error;
      return data as unknown as MessageUsageRow[];
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    );
  }

  const withMessages = (rows ?? []).filter((r) => r.message_count > 0);

  if (withMessages.length === 0) {
    return <p className="text-sm text-muted-foreground">No messages recorded this month yet.</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        WhatsApp messages and estimated cost this calendar month, by store.
      </p>
      {withMessages.map((row) => {
        const overAllowance = row.plan_limit != null && row.message_count > row.plan_limit;
        return (
          <div
            key={row.store_id}
            className="flex items-center justify-between rounded-xl border border-border p-4"
          >
            <div>
              <p className="font-medium">{row.store_name}</p>
              <p className="text-xs text-muted-foreground">
                {row.plan_code}
                {row.plan_limit != null ? ` · ${row.plan_limit} included` : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="figures text-sm font-medium">
                {row.message_count} messages · {formatMoney(row.cost_ngn)}
              </p>
              {overAllowance && (
                <Badge variant="outline" className="mt-1 border-owed text-owed">
                  Over plan allowance
                </Badge>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LeadsTab() {
  const { data: leads, isLoading } = useQuery({
    queryKey: ["admin-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!leads || leads.length === 0) {
    return <p className="text-sm text-muted-foreground">No leads yet.</p>;
  }

  return (
    <div className="space-y-2">
      {leads.map((lead) => (
        <div key={lead.id} className="rounded-xl border border-border p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <p className="font-medium">{lead.name}</p>
              <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-muted-foreground">
                {lead.source}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              {new Date(lead.created_at).toLocaleString()}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {[lead.phone, lead.email].filter(Boolean).join(" · ") || "No contact given"}
          </p>
          {lead.message && <p className="mt-2 text-sm">{lead.message}</p>}
        </div>
      ))}
    </div>
  );
}

function AuditTab() {
  const { data: logs, isLoading } = useQuery({
    queryKey: ["admin-audit-logs"],
    queryFn: async () => {
      const { data, error } = await rpcAdmin("admin_list_audit_logs", { p_limit: 200 });
      if (error) throw error;
      return data as unknown as AuditRow[];
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {(logs ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No audit events yet.</p>
      ) : (
        (logs ?? []).map((log) => (
          <div key={log.id} className="rounded-xl border border-border p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">{log.action}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(log.created_at).toLocaleString()}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {log.actor_name ?? "System"}
              {log.store_name ? ` · ${log.store_name}` : ""}
              {log.entity ? ` · ${log.entity}` : ""}
            </p>
          </div>
        ))
      )}
    </div>
  );
}
