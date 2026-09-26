import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { BrandLogo } from "@/components/jaylor/logo";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { formatMoney, planCodeToTier } from "@/lib/jaylor";
import { TierBadge } from "@/components/jaylor/tier-badge";
import { getErrorMessage } from "@/lib/utils";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";

function compactMoney(n: number) {
  return new Intl.NumberFormat("en-NG", { notation: "compact", maximumFractionDigits: 1 }).format(
    n,
  );
}

// Fixed-order categorical marks, validated for lightness/chroma/CVD-separation/
// contrast against both chart surfaces -- see src/styles.css.
const VIZ_COLORS = [
  "var(--color-viz-1)",
  "var(--color-viz-2)",
  "var(--color-viz-3)",
  "var(--color-viz-4)",
  "var(--color-viz-5)",
];

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

type PlatformTotals = {
  total_clients: number;
  total_orders: number;
  total_users: number;
  total_visitors_30d: number;
  gmv_collected: number;
};

// Admin RPCs that exist in the database but aren't in the generated Database types yet.
// Must stay a call on `supabase` itself, not a bare extracted reference --
// supabase.rpc() is a normal method that reads `this.rest` internally, so
// aliasing it directly (`const x = supabase.rpc`) and calling `x(...)` loses
// that binding and throws "Cannot read properties of undefined (reading 'rest')".
function rpcAdmin(
  fn: string,
  args: Record<string, unknown>,
): Promise<{ data: unknown; error: { message: string } | null }> {
  return supabase.rpc(fn as never, args as never) as unknown as Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
}

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

type TeamMember = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: "super_admin" | "admin" | "support";
  label: string | null;
  created_at: string;
  is_you: boolean;
};

type LiveBoardStats = {
  active_stores: number;
  sales_30d: number;
  sales_today: number;
  avg_order_value_30d: number;
  new_stores_30d: number;
  stores_on_trial: number;
  stores_converted: number;
  stores_inactive: number;
};

type RevenuePoint = { day: string; amount: number };
type TopStore = { store_id: string; store_name: string; amount: number };

type SearchResults = {
  stores: { id: string; name: string; slug: string; city: string | null }[];
  clients: {
    id: string;
    full_name: string;
    phone: string;
    store_id: string;
    store_name: string;
  }[];
  orders: {
    id: string;
    number: string;
    garment_type: string;
    store_id: string;
    store_name: string;
    created_at: string;
  }[];
  payments: {
    id: string;
    amount: number;
    reference: string | null;
    store_id: string;
    store_name: string;
    paid_at: string;
  }[];
};

type PlatformHealth = {
  errors_last_hour: number;
  errors_last_24h: number;
  webhook_total_24h: number;
  webhook_failed_24h: number;
  signups_24h: number;
  orders_24h: number;
  payments_24h: number;
  active_stores: number;
  inactive_stores: number;
  last_rls_check: { ok: boolean; checked_at: string } | null;
};

type BillingEvent =
  | {
      kind: "payment";
      store_id: string;
      store_name: string;
      plan_code: string;
      amount: number;
      status: string;
      reference: string | null;
      event_at: string;
    }
  | {
      kind: "plan_change";
      store_id: string;
      store_name: string;
      from_plan: string | null;
      to_plan: string;
      event_at: string;
    };

type RecentErrors = {
  since: string;
  function_errors: { id: string; message: string; status: number; created_at: string }[];
  webhook_errors: { id: string; event: string; processing_error: string; received_at: string }[];
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

  const { data: myRole } = useQuery({
    queryKey: ["admin-my-role"],
    enabled: signedIn && !!isAdmin,
    queryFn: async () => {
      const { data, error } = await rpcAdmin("admin_my_role", {});
      if (error) throw error;
      return data as string | null;
    },
  });
  const isSuperAdmin = myRole === "super_admin";
  const isReadOnly = myRole === "support";

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
          <div className="flex items-center gap-3">
            <BrandLogo markClassName="h-10 w-auto" />
            <span className="border-l border-border pl-3 text-sm font-medium text-muted-foreground">
              Platform admin
            </span>
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
            <TabsTrigger value="search">Search</TabsTrigger>
            <TabsTrigger value="health">Health</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="plans">Plans</TabsTrigger>
            <TabsTrigger value="billing">Billing</TabsTrigger>
            <TabsTrigger value="messaging">Messaging</TabsTrigger>
            <TabsTrigger value="ai-usage">AI usage</TabsTrigger>
            <TabsTrigger value="leads">Leads</TabsTrigger>
            <TabsTrigger value="audit">Audit log</TabsTrigger>
            <TabsTrigger value="errors">Errors</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            {isSuperAdmin && <TabsTrigger value="team">Team</TabsTrigger>}
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            <OverviewTab />
          </TabsContent>
          <TabsContent value="search" className="mt-6">
            <SearchTab />
          </TabsContent>
          <TabsContent value="health" className="mt-6">
            <HealthTab />
          </TabsContent>
          <TabsContent value="analytics" className="mt-6">
            <AnalyticsTab />
          </TabsContent>
          <TabsContent value="plans" className="mt-6">
            <PlansTab readOnly={isReadOnly} />
          </TabsContent>
          <TabsContent value="billing" className="mt-6">
            <BillingTab />
          </TabsContent>
          <TabsContent value="messaging" className="mt-6">
            <MessagingTab />
          </TabsContent>

          <TabsContent value="ai-usage" className="mt-6">
            <AiUsageTab readOnly={isReadOnly} />
          </TabsContent>
          <TabsContent value="leads" className="mt-6">
            <LeadsTab />
          </TabsContent>
          <TabsContent value="audit" className="mt-6">
            <AuditTab />
          </TabsContent>
          <TabsContent value="errors" className="mt-6">
            <ErrorsTab />
          </TabsContent>
          <TabsContent value="security" className="mt-6">
            <SecurityTab />
          </TabsContent>
          {isSuperAdmin && (
            <TabsContent value="team" className="mt-6">
              <TeamTab />
            </TabsContent>
          )}
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

function LiveBoard({
  stats,
  stores,
}: {
  stats: Stats | undefined;
  stores: StoreRow[] | undefined;
}) {
  const { data: board, isLoading: boardLoading } = useQuery({
    queryKey: ["admin-live-board-stats"],
    queryFn: async () => {
      const { data, error } = await rpcAdmin("admin_live_board_stats", {});
      if (error) throw error;
      return data as unknown as LiveBoardStats;
    },
    refetchInterval: 60_000,
  });

  const { data: revenueSeries, isLoading: revenueLoading } = useQuery({
    queryKey: ["admin-revenue-series"],
    queryFn: async () => {
      const { data, error } = await rpcAdmin("admin_revenue_series", { p_days: 30 });
      if (error) throw error;
      return data as unknown as RevenuePoint[];
    },
  });

  const { data: topStores, isLoading: topStoresLoading } = useQuery({
    queryKey: ["admin-top-stores"],
    queryFn: async () => {
      const { data, error } = await rpcAdmin("admin_top_stores_by_revenue", {
        p_days: 30,
        p_limit: 5,
      });
      if (error) throw error;
      return data as unknown as TopStore[];
    },
  });

  const recentSignups = [...(stores ?? [])]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  const planEntries = Object.entries(stats?.stores_by_plan ?? {});
  const revenueChartData = (revenueSeries ?? []).map((p) => ({
    day: new Date(p.day).toLocaleDateString(undefined, { day: "numeric", month: "short" }),
    amount: p.amount,
  }));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl">Live board</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Last 30 days, refreshes every minute.
          </p>
        </div>
        <Badge className="border-paid/40 bg-paid/10 text-paid">Live</Badge>
      </div>

      {boardLoading || !board ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Active stores" value={String(board.active_stores)} />
          <Stat label="Sales, last 30 days" value={formatMoney(board.sales_30d)} />
          <Stat label="Avg order value" value={formatMoney(board.avg_order_value_30d)} />
          <Stat label="Sales today" value={formatMoney(board.sales_today)} />
          <Stat label="New stores, 30 days" value={String(board.new_stores_30d)} />
        </div>
      )}

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <p className="font-medium">Top stores, last 30 days</p>
            {topStoresLoading ? (
              <div className="mt-3 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 rounded-lg" />
                ))}
              </div>
            ) : !topStores || topStores.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No sales yet.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {topStores.map((s, i) => (
                  <Link
                    key={s.store_id}
                    to="/admin/stores/$storeId"
                    params={{ storeId: s.store_id }}
                    className="flex items-center justify-between gap-3 rounded-lg px-1 py-1 text-sm hover:bg-accent/40"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-xs text-muted-foreground">
                        {i + 1}
                      </span>
                      <span className="truncate">{s.store_name}</span>
                    </span>
                    <span className="figures shrink-0 text-paid">{formatMoney(s.amount)}</span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl lg:col-span-2">
          <CardContent className="p-5">
            <p className="font-medium">Revenue, last 30 days</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Confirmed payments per day</p>
            {revenueLoading ? (
              <Skeleton className="mt-3 h-48 rounded-xl" />
            ) : (
              <ChartContainer
                config={{ amount: { label: "Revenue", color: "var(--color-viz-1)" } }}
                className="mt-3 h-48 w-full"
              >
                <AreaChart data={revenueChartData}>
                  <defs>
                    <linearGradient id="admin-revenue-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-amount)" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="var(--color-amount)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="day"
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    tickFormatter={(v: number) => compactMoney(v)}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke="var(--color-amount)"
                    strokeWidth={2}
                    fill="url(#admin-revenue-fill)"
                  />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <p className="font-medium">Recent signups</p>
            {!stores ? (
              <div className="mt-3 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 rounded-lg" />
                ))}
              </div>
            ) : recentSignups.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No signups yet.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {recentSignups.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate">{s.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {new Date(s.created_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <p className="font-medium">Store lifecycle</p>
            {!board ? (
              <Skeleton className="mt-3 h-24 rounded-xl" />
            ) : (
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">On trial</span>
                  <span className="figures">{board.stores_on_trial}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Converted to paid</span>
                  <span className="figures">{board.stores_converted}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Inactive</span>
                  <span className="figures">{board.stores_inactive}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <p className="font-medium">Stores by plan</p>
            {!stats || planEntries.length === 0 ? (
              <Skeleton className="mt-3 h-24 rounded-xl" />
            ) : (
              <div className="mt-2 flex items-center gap-4">
                <ChartContainer config={{}} className="aspect-square h-28 w-28 shrink-0">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                    <Pie
                      data={planEntries.map(([plan, count]) => ({ name: plan, value: count }))}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="60%"
                      outerRadius="100%"
                      strokeWidth={2}
                    >
                      {planEntries.map(([plan], i) => (
                        <Cell key={plan} fill={VIZ_COLORS[i % VIZ_COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <div className="space-y-1.5 text-sm">
                  {planEntries.map(([plan, count], i) => (
                    <div key={plan} className="flex items-center gap-2">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: VIZ_COLORS[i % VIZ_COLORS.length] }}
                      />
                      <span className="text-muted-foreground">{planCodeToTier(plan)}</span>
                      <span className="figures ml-auto font-medium">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
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

  const { data: totals, isLoading: totalsLoading } = useQuery({
    queryKey: ["admin-platform-totals"],
    queryFn: async () => {
      const { data, error } = await rpcAdmin("admin_platform_totals", {});
      if (error) throw error;
      return data as unknown as PlatformTotals;
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
      <LiveBoard stats={stats} stores={stores} />

      <h2 className="mt-10 text-xl">Growth details</h2>
      {statsLoading || totalsLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stats && (
            <>
              <Stat label="Total stores" value={String(stats.total_stores)} />
              <Stat label="New in 30 days" value={String(stats.new_stores_30d)} />
              <Stat label="Trials ending in 7 days" value={String(stats.trials_ending_7d)} />
              <Stat label="Active this week" value={String(stats.active_this_week)} />
              <Stat label="Estimated MRR" value={formatMoney(stats.mrr_estimate)} />
              {Object.entries(stats.stores_by_plan).map(([plan, count]) => (
                <Stat key={plan} label={`On ${planCodeToTier(plan)}`} value={String(count)} />
              ))}
            </>
          )}
          {totals && (
            <>
              <Stat label="Total clients" value={String(totals.total_clients)} />
              <Stat label="Total orders" value={String(totals.total_orders)} />
              <Stat label="Registered users" value={String(totals.total_users)} />
              <Stat label="Visitors (30 days)" value={String(totals.total_visitors_30d)} />
              <Stat label="Collected all-time" value={formatMoney(totals.gmv_collected)} />
            </>
          )}
        </div>
      )}

      <h2 className="mt-8 text-xl">All stores</h2>
      {storesLoading ? (
        <div className="mt-3 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {(stores ?? []).map((store) => (
            <Link
              key={store.id}
              to="/admin/stores/$storeId"
              params={{ storeId: store.id }}
              className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-accent/40"
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
            </Link>
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

function PlansTab({ readOnly }: { readOnly: boolean }) {
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
          {!readOnly && (
            <Button size="sm" variant="outline" onClick={() => openEdit(plan)}>
              Edit
            </Button>
          )}
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

type AiUsageRow = {
  store_id: string;
  store_name: string;
  plan_code: string;
  action_count: number;
  cost_usd: number;
  cost_ngn: number;
};

type AiBudgetStatus = {
  budget_usd: number;
  spent_usd: number;
  pct_used: number;
  total_calls: number;
  cached_calls: number;
  cache_hit_rate: number;
  projected_month_end_usd: number;
};

type AiRateLimitedStore = {
  store_id: string;
  store_name: string;
  plan_code: string;
  calls_last_hour: number;
  hourly_limit: number;
  calls_last_day: number;
  daily_limit: number;
};

function AiBudgetPanel({ readOnly }: { readOnly: boolean }) {
  const queryClient = useQueryClient();
  const [budgetInput, setBudgetInput] = useState("");
  const [savingBudget, setSavingBudget] = useState(false);

  const { data: status, isLoading } = useQuery({
    queryKey: ["admin-ai-budget-status"],
    queryFn: async () => {
      const { data, error } = await rpcAdmin("admin_ai_budget_status", {});
      if (error) throw error;
      return data as unknown as AiBudgetStatus;
    },
  });

  const { data: rateLimited } = useQuery({
    queryKey: ["admin-ai-rate-limited-stores"],
    queryFn: async () => {
      const { data, error } = await rpcAdmin("admin_ai_rate_limited_stores", {});
      if (error) throw error;
      return data as unknown as AiRateLimitedStore[];
    },
  });

  async function saveBudget() {
    const value = Number(budgetInput);
    if (!Number.isFinite(value) || value < 0) {
      toast.error("Enter a valid budget in USD");
      return;
    }
    setSavingBudget(true);
    try {
      const { error } = await rpcAdmin("admin_set_ai_budget", { p_budget_usd: value });
      if (error) throw error;
      toast.success("Monthly AI budget updated");
      setBudgetInput("");
      queryClient.invalidateQueries({ queryKey: ["admin-ai-budget-status"] });
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not update the budget"));
    } finally {
      setSavingBudget(false);
    }
  }

  if (isLoading || !status) {
    return <Skeleton className="h-40 rounded-xl" />;
  }

  const pctLabel = `${Math.round(status.pct_used * 100)}%`;
  const nearBudget = status.pct_used >= 0.8;

  return (
    <div className="space-y-4 rounded-2xl border border-border p-4">
      <div className="flex items-center justify-between">
        <p className="font-medium">This month's global AI budget</p>
        <Badge variant="outline" className={nearBudget ? "border-owed/40 text-owed" : undefined}>
          {pctLabel} used
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">Budget</p>
          <p className="figures font-medium">${status.budget_usd.toFixed(0)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Spent</p>
          <p className="figures font-medium">${status.spent_usd.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Projected month-end</p>
          <p className="figures font-medium">${status.projected_month_end_usd.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Cache hit rate</p>
          <p className="figures font-medium">
            {Math.round(status.cache_hit_rate * 100)}% ({status.cached_calls}/{status.total_calls})
          </p>
        </div>
      </div>
      {readOnly ? (
        <p className="text-xs text-muted-foreground">
          Read-only access — ask a super admin to change the budget.
        </p>
      ) : (
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor="ai-budget-input">Set monthly budget (USD)</Label>
            <Input
              id="ai-budget-input"
              inputMode="decimal"
              placeholder={status.budget_usd.toFixed(0)}
              value={budgetInput}
              onChange={(e) => setBudgetInput(e.target.value)}
            />
          </div>
          <Button onClick={saveBudget} disabled={savingBudget || !budgetInput.trim()}>
            {savingBudget ? "Saving..." : "Save"}
          </Button>
        </div>
      )}
      {rateLimited && rateLimited.length > 0 && (
        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">Currently rate-limited shops</p>
          {rateLimited.map((r) => (
            <div key={r.store_id} className="flex items-center justify-between text-sm">
              <span>
                {r.store_name}{" "}
                <span className="text-xs text-muted-foreground">({r.plan_code})</span>
              </span>
              <span className="figures text-xs text-muted-foreground">
                {r.calls_last_hour}/{r.hourly_limit} hr · {r.calls_last_day}/{r.daily_limit} day
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AiUsageTab({ readOnly }: { readOnly: boolean }) {
  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin-ai-usage"],
    queryFn: async () => {
      const { data, error } = await rpcAdmin("admin_store_ai_usage", {});
      if (error) throw error;
      return data as unknown as AiUsageRow[];
    },
  });

  return (
    <div className="space-y-4">
      <AiBudgetPanel readOnly={readOnly} />
      <AiUsageRows rows={rows} isLoading={isLoading} />
    </div>
  );
}

function AiUsageRows({ rows, isLoading }: { rows: AiUsageRow[] | undefined; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No AI actions logged this month yet.</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        AI actions (voice entry, chat import, notebook scan, style cards, AI replies) and estimated
        cost this calendar month, by store, sorted by cost.
      </p>
      {rows.map((row) => (
        <div
          key={row.store_id}
          className="flex items-center justify-between rounded-xl border border-border p-4"
        >
          <div>
            <p className="font-medium">{row.store_name}</p>
            <p className="text-xs text-muted-foreground">{row.plan_code}</p>
          </div>
          <div className="text-right">
            <p className="figures text-sm font-medium">
              {row.action_count} actions · {formatMoney(row.cost_ngn)}
            </p>
            <p className="text-xs text-muted-foreground">${row.cost_usd.toFixed(4)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

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

type DriftReport = {
  checked_at: string;
  ok: boolean;
  tables_without_rls: string[];
  public_role_policies: string[];
  unexpected_anon_grants: string[];
  unexpected_authenticated_grants: string[];
};

const DRIFT_LABELS: Record<keyof Omit<DriftReport, "checked_at" | "ok">, string> = {
  tables_without_rls: "Tables with RLS disabled",
  public_role_policies: "Policies targeting the public role instead of anon/authenticated",
  unexpected_anon_grants: "Grants anon shouldn't hold",
  unexpected_authenticated_grants: "Grants authenticated shouldn't hold",
};

function MfaSection() {
  const queryClient = useQueryClient();
  const [enrolling, setEnrolling] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: factors, isLoading } = useQuery({
    queryKey: ["mfa-factors"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      return data;
    },
  });

  const enabled = (factors?.totp.length ?? 0) > 0;

  async function startEnrollment() {
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (error) throw error;
      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setEnrolling(true);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not start enrollment"));
    } finally {
      setBusy(false);
    }
  }

  async function verifyEnrollment() {
    if (!factorId || code.trim().length !== 6) {
      toast.error("Enter the 6-digit code from your authenticator app");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
      if (error) throw error;
      toast.success("Two-factor authentication enabled");
      setEnrolling(false);
      setFactorId(null);
      setQrCode(null);
      setSecret(null);
      setCode("");
      queryClient.invalidateQueries({ queryKey: ["mfa-factors"] });
    } catch (error) {
      toast.error(getErrorMessage(error, "That code didn't match — try again"));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    const existing = factors?.totp[0];
    if (!existing) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: existing.id });
      if (error) throw error;
      toast.success("Two-factor authentication turned off");
      queryClient.invalidateQueries({ queryKey: ["mfa-factors"] });
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not turn this off"));
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) return <Skeleton className="h-24 rounded-xl" />;

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-center justify-between">
        <p className="font-medium">Two-factor authentication</p>
        <Badge
          className={
            enabled ? "border-paid/40 bg-paid/10 text-paid" : "border-border text-muted-foreground"
          }
          variant={enabled ? undefined : "outline"}
        >
          {enabled ? "Enabled" : "Not enabled"}
        </Badge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Adds a code from an authenticator app (Google Authenticator, Authy, 1Password, etc.) on top
        of your password when you sign in. Optional, for your own admin account only.
      </p>

      {enabled ? (
        <Button variant="outline" className="mt-3" onClick={disable} disabled={busy}>
          {busy ? "Turning off..." : "Turn off two-factor authentication"}
        </Button>
      ) : enrolling ? (
        <div className="mt-3 space-y-3">
          {qrCode && (
            <img
              src={qrCode}
              alt="Scan this QR code in your authenticator app"
              className="size-40"
            />
          )}
          {secret && (
            <p className="text-xs text-muted-foreground">
              Or enter this code manually: <span className="figures">{secret}</span>
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="mfa-code">6-digit code</Label>
            <Input
              id="mfa-code"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setEnrolling(false);
                setFactorId(null);
              }}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button onClick={verifyEnrollment} disabled={busy}>
              {busy ? "Verifying..." : "Verify and enable"}
            </Button>
          </div>
        </div>
      ) : (
        <Button className="mt-3" onClick={startEnrollment} disabled={busy}>
          {busy ? "Starting..." : "Enable two-factor authentication"}
        </Button>
      )}
    </div>
  );
}

function SecurityTab() {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);

  const { data: latest, isLoading } = useQuery({
    queryKey: ["rls-drift-latest"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rls_drift_checks")
        .select("*")
        .order("checked_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  async function runCheck() {
    setRunning(true);
    try {
      const { error } = await rpcAdmin("check_rls_drift", {});
      if (error) throw error;
      toast.success("Drift check complete");
      queryClient.invalidateQueries({ queryKey: ["rls-drift-latest"] });
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not run the check"));
    } finally {
      setRunning(false);
    }
  }

  const report = latest?.report as unknown as DriftReport | undefined;

  return (
    <div className="space-y-4">
      <MfaSection />
      <StitchDivider />
      <p className="text-sm text-muted-foreground">
        Re-checks the same grant/policy conditions the security audit's L2 and L9 findings fixed —
        anon holding more than its narrow allowed set, authenticated reaching admin-only tables, a
        table with RLS disabled, or a policy targeting the bare public role. Scheduled weekly if
        pg_cron is enabled on this project; run manually any time below.
      </p>
      <Button onClick={runCheck} disabled={running}>
        {running ? "Running..." : "Run check now"}
      </Button>

      {isLoading ? (
        <Skeleton className="h-24 rounded-xl" />
      ) : !report ? (
        <p className="text-sm text-muted-foreground">No check has run yet.</p>
      ) : (
        <div className="rounded-xl border border-border p-4">
          <div className="flex items-center justify-between">
            <Badge
              className={
                report.ok
                  ? "border-paid/40 bg-paid/10 text-paid"
                  : "border-owed/40 bg-owed/10 text-owed"
              }
            >
              {report.ok ? "No drift found" : "Drift found"}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {new Date(report.checked_at).toLocaleString()}
            </span>
          </div>
          {!report.ok && (
            <div className="mt-3 space-y-2">
              {(Object.keys(DRIFT_LABELS) as (keyof Omit<DriftReport, "checked_at" | "ok">)[]).map(
                (key) =>
                  report[key]?.length > 0 ? (
                    <div key={key} className="text-sm">
                      <p className="font-medium">{DRIFT_LABELS[key]}</p>
                      <p className="text-xs text-muted-foreground">{report[key].join(", ")}</p>
                    </div>
                  ) : null,
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SearchSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
        {title}
      </p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function SearchTab() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin-search", submitted],
    enabled: submitted.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await rpcAdmin("admin_search", { p_query: submitted.trim() });
      if (error) throw error;
      return data as unknown as SearchResults;
    },
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(query);
  }

  const hasResults =
    !!data &&
    (data.stores.length > 0 ||
      data.clients.length > 0 ||
      data.orders.length > 0 ||
      data.payments.length > 0);

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Shop name, client name/phone, order number, or payment reference"
        />
        <Button type="submit" disabled={query.trim().length < 2}>
          Search
        </Button>
      </form>

      {isLoading || isFetching ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : submitted.trim().length < 2 ? (
        <p className="text-sm text-muted-foreground">Enter at least 2 characters to search.</p>
      ) : !hasResults ? (
        <p className="text-sm text-muted-foreground">
          No matches across stores, clients, orders or payments.
        </p>
      ) : (
        <div className="space-y-6">
          {data!.stores.length > 0 && (
            <SearchSection title="Stores">
              {data!.stores.map((s) => (
                <Link
                  key={s.id}
                  to="/admin/stores/$storeId"
                  params={{ storeId: s.id }}
                  className="flex items-center justify-between rounded-xl border border-border p-3 hover:bg-accent/40"
                >
                  <span className="font-medium">{s.name}</span>
                  <span className="text-xs text-muted-foreground">
                    jaylor.ng/{s.slug} {s.city ? `· ${s.city}` : ""}
                  </span>
                </Link>
              ))}
            </SearchSection>
          )}
          {data!.clients.length > 0 && (
            <SearchSection title="Clients">
              {data!.clients.map((c) => (
                <Link
                  key={c.id}
                  to="/admin/stores/$storeId"
                  params={{ storeId: c.store_id }}
                  className="flex items-center justify-between rounded-xl border border-border p-3 hover:bg-accent/40"
                >
                  <span className="font-medium">{c.full_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {c.phone} · {c.store_name}
                  </span>
                </Link>
              ))}
            </SearchSection>
          )}
          {data!.orders.length > 0 && (
            <SearchSection title="Orders">
              {data!.orders.map((o) => (
                <Link
                  key={o.id}
                  to="/admin/stores/$storeId"
                  params={{ storeId: o.store_id }}
                  className="flex items-center justify-between rounded-xl border border-border p-3 hover:bg-accent/40"
                >
                  <span className="font-medium">
                    {o.number} · {o.garment_type}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {o.store_name} · {new Date(o.created_at).toLocaleDateString()}
                  </span>
                </Link>
              ))}
            </SearchSection>
          )}
          {data!.payments.length > 0 && (
            <SearchSection title="Payments">
              {data!.payments.map((p) => (
                <Link
                  key={p.id}
                  to="/admin/stores/$storeId"
                  params={{ storeId: p.store_id }}
                  className="flex items-center justify-between rounded-xl border border-border p-3 hover:bg-accent/40"
                >
                  <span className="font-medium">{formatMoney(p.amount)}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.reference ?? "—"} · {p.store_name}
                  </span>
                </Link>
              ))}
            </SearchSection>
          )}
        </div>
      )}
    </div>
  );
}

function HealthTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-platform-health"],
    queryFn: async () => {
      const { data, error } = await rpcAdmin("admin_platform_health", {});
      if (error) throw error;
      return data as unknown as PlatformHealth;
    },
    refetchInterval: 60_000,
  });

  if (isLoading || !data) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
    );
  }

  const webhookFailRate =
    data.webhook_total_24h > 0
      ? Math.round((data.webhook_failed_24h / data.webhook_total_24h) * 100)
      : 0;
  const isHealthy = data.errors_last_hour === 0 && webhookFailRate < 10;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl">System health</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Live signals from edge function errors, WhatsApp webhook delivery, and platform
            activity. Refreshes every minute.
          </p>
        </div>
        <Badge
          className={
            isHealthy
              ? "border-paid/40 bg-paid/10 text-paid"
              : "border-owed/40 bg-owed/10 text-owed"
          }
        >
          {isHealthy ? "Healthy" : "Needs attention"}
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Errors (last hour)" value={String(data.errors_last_hour)} />
        <Stat label="Errors (24h)" value={String(data.errors_last_24h)} />
        <Stat
          label="WhatsApp webhook failures (24h)"
          value={`${data.webhook_failed_24h} / ${data.webhook_total_24h} (${webhookFailRate}%)`}
        />
        <Stat label="Signups (24h)" value={String(data.signups_24h)} />
        <Stat label="Orders created (24h)" value={String(data.orders_24h)} />
        <Stat label="Payments collected (24h)" value={String(data.payments_24h)} />
        <Stat label="Active stores" value={String(data.active_stores)} />
        <Stat label="Inactive stores" value={String(data.inactive_stores)} />
        <Stat
          label="Last security drift check"
          value={
            data.last_rls_check ? (data.last_rls_check.ok ? "Clean" : "Drift found") : "Never run"
          }
        />
      </div>
    </div>
  );
}

function BillingTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-billing-history"],
    queryFn: async () => {
      const { data, error } = await rpcAdmin("admin_billing_history", {
        p_store_id: null,
        p_limit: 200,
      });
      if (error) throw error;
      return data as unknown as BillingEvent[];
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No subscription payments or plan changes yet.</p>
    );
  }

  return (
    <div className="space-y-2">
      {data.map((event, i) => (
        <div
          key={i}
          className="flex items-center justify-between rounded-xl border border-border p-3 text-sm"
        >
          <div>
            <p className="font-medium">
              {event.kind === "payment"
                ? `${event.store_name} paid for ${planCodeToTier(event.plan_code)}`
                : `${event.store_name} moved ${event.from_plan ? `from ${planCodeToTier(event.from_plan)} ` : ""}to ${planCodeToTier(event.to_plan)}`}
            </p>
            <p className="text-xs text-muted-foreground">
              {event.kind === "payment"
                ? `${formatMoney(event.amount)} · ${event.status}${event.reference ? ` · ${event.reference}` : ""}`
                : "Plan change"}
            </p>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {new Date(event.event_at).toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

function ErrorsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-recent-errors"],
    queryFn: async () => {
      const { data, error } = await rpcAdmin("admin_recent_errors", { p_hours: 24 });
      if (error) throw error;
      return data as unknown as RecentErrors;
    },
    refetchInterval: 60_000,
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
      </div>
    );
  }

  const noErrors = data.function_errors.length === 0 && data.webhook_errors.length === 0;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Server-side (5xx) errors from edge functions, and failed WhatsApp webhook deliveries, in the
        last 24 hours. Edge function errors are only captured going forward from when this shipped —
        nothing before that is recorded.
      </p>
      {noErrors ? (
        <p className="text-sm text-muted-foreground">No incidents in the last 24 hours.</p>
      ) : (
        <>
          {data.function_errors.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
                Edge function errors ({data.function_errors.length})
              </p>
              <div className="space-y-2">
                {data.function_errors.map((e) => (
                  <div
                    key={e.id}
                    className="rounded-xl border border-owed/40 bg-owed/5 p-3 text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="border-owed/40 text-owed">
                        {e.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(e.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-1">{e.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {data.webhook_errors.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
                WhatsApp webhook failures ({data.webhook_errors.length})
              </p>
              <div className="space-y-2">
                {data.webhook_errors.map((w) => (
                  <div
                    key={w.id}
                    className="rounded-xl border border-owed/40 bg-owed/5 p-3 text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="border-owed/40 text-owed">
                        {w.event}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(w.received_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-1">{w.processing_error}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TeamTab() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "support">("admin");
  const [busy, setBusy] = useState(false);

  const { data: members, isLoading } = useQuery({
    queryKey: ["admin-team"],
    queryFn: async () => {
      const { data, error } = await rpcAdmin("admin_list_team", {});
      if (error) throw error;
      return data as unknown as TeamMember[];
    },
  });

  async function addMember() {
    if (!email.trim()) {
      toast.error("Enter an email address");
      return;
    }
    setBusy(true);
    try {
      const { error } = await rpcAdmin("admin_add_team_member", {
        p_email: email.trim(),
        p_role: role,
      });
      if (error) throw error;
      toast.success("Added to the team");
      setEmail("");
      queryClient.invalidateQueries({ queryKey: ["admin-team"] });
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not add this person"));
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(member: TeamMember, nextRole: "admin" | "support") {
    try {
      const { error } = await rpcAdmin("admin_update_team_role", {
        p_user_id: member.user_id,
        p_role: nextRole,
      });
      if (error) throw error;
      toast.success("Role updated");
      queryClient.invalidateQueries({ queryKey: ["admin-team"] });
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not update this role"));
    }
  }

  async function removeMember(member: TeamMember) {
    if (!window.confirm(`Remove ${member.email ?? "this person"} from the platform team?`)) return;
    try {
      const { error } = await rpcAdmin("admin_remove_team_member", { p_user_id: member.user_id });
      if (error) throw error;
      toast.success("Removed from the team");
      queryClient.invalidateQueries({ queryKey: ["admin-team"] });
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not remove this person"));
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl">Platform team</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Who can access this dashboard, and what they can do. A super admin&apos;s own access can
          only be changed by that person — nobody else, including another super admin, can demote or
          remove them.
        </p>
      </div>

      <div className="space-y-2">
        {(members ?? []).map((member) => (
          <div
            key={member.user_id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">
                {member.full_name || member.email || member.user_id}
                {member.is_you && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
              </p>
              <p className="truncate text-xs text-muted-foreground">{member.email}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {member.role === "super_admin" ? (
                <Badge>Super admin</Badge>
              ) : (
                <Select
                  value={member.role}
                  onValueChange={(value) => changeRole(member, value as "admin" | "support")}
                >
                  <SelectTrigger className="h-8 w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="support">Support (read-only)</SelectItem>
                  </SelectContent>
                </Select>
              )}
              {(member.role !== "super_admin" || member.is_you) && (
                <Button size="sm" variant="outline" onClick={() => removeMember(member)}>
                  Remove
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border p-4">
        <p className="font-medium">Add someone</p>
        <p className="mt-1 text-xs text-muted-foreground">
          They need a Jaylor account already, under the email they signed up with.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1 space-y-1">
            <Label htmlFor="team-email">Email</Label>
            <Input
              id="team-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@example.com"
            />
          </div>
          <div className="space-y-1">
            <Label>Role</Label>
            <Select value={role} onValueChange={(value) => setRole(value as "admin" | "support")}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="support">Support (read-only)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={addMember} disabled={busy}>
            {busy ? "Adding..." : "Add"}
          </Button>
        </div>
      </div>
    </div>
  );
}
