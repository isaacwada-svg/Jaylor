import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/jaylor/app-shell";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { StitchTrack } from "@/components/jaylor/stitch-track";
import { MoneyText } from "@/components/jaylor/money-text";
import { EmptyState } from "@/components/jaylor/empty-state";
import { LockedFeature } from "@/components/jaylor/locked-feature";
import { RemindButton } from "@/components/jaylor/remind-button";
import { CollectionScoreCard } from "@/components/jaylor/collection-score";
import { DailyWorkPlan } from "@/components/jaylor/daily-work-plan";
import { ComingUpCard } from "@/components/jaylor/coming-up-card";
import { MomentsSection } from "@/components/jaylor/moments-section";
import { MilestoneCelebration } from "@/components/jaylor/milestone-celebration";
import { DashboardOverview } from "@/components/jaylor/dashboard-overview";
import { TodayCard } from "@/components/jaylor/today-card";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useStore } from "@/lib/store-context";
import { supabase } from "@/integrations/supabase/client";
import { ORDER_STATUSES_DB, WHATSAPP_AUTO_TOPUP_ENABLED } from "@/lib/jaylor";
import { useOrderStatusLabel } from "@/lib/i18n/app-labels";
import { useAppT } from "@/lib/i18n/i18n-context";
import { OnTimeScoreCard } from "@/components/jaylor/on-time-score-card";
import { CapacityLoadChart } from "@/components/jaylor/capacity-load-chart";
import { LowStockCard } from "@/components/jaylor/low-stock-card";
import { orderReadyMessageI18n, resolveMessageLanguage } from "@/lib/whatsapp-i18n";
import { useFeature } from "@/lib/use-feature";
import { useMessageTopups } from "@/lib/use-message-topups";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { SectionHeader } from "@/components/jaylor/section-header";
import { Wallet, Banknote, CalendarClock, Package } from "lucide-react";

function compactMoney(n: number) {
  return new Intl.NumberFormat("en-NG", { notation: "compact", maximumFractionDigits: 1 }).format(
    n,
  );
}

function useFirstName() {
  const [firstName, setFirstName] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const fullName = (data.user?.user_metadata as { full_name?: string } | undefined)?.full_name;
      setFirstName(fullName?.trim().split(/\s+/)[0] ?? null);
    });
  }, []);
  return firstName;
}

function greetingKey(): "greeting_morning" | "greeting_afternoon" | "greeting_evening" {
  const hour = new Date().getHours();
  if (hour < 12) return "greeting_morning";
  if (hour < 17) return "greeting_afternoon";
  return "greeting_evening";
}

const GREETING_FALLBACK = {
  greeting_morning: "Good morning",
  greeting_afternoon: "Good afternoon",
  greeting_evening: "Good evening",
} as const;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function trialDaysLeft(trialEndsAt: string): number {
  return Math.max(
    0,
    Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
  );
}

export const Route = createFileRoute("/_authenticated/dashboard")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Jaylor — Every order tracked. Every naira collected." },
      {
        name: "description",
        content:
          "Jaylor tracks every order, measurement and payment for tailors and fashion houses, and reminds clients on WhatsApp so you get paid on time.",
      },
      { property: "og:title", content: "Jaylor — Every order tracked. Every naira collected." },
      {
        property: "og:description",
        content:
          "Orders, measurements, payments and client reminders for tailors and fashion houses in Nigeria.",
      },
    ],
  }),
  component: Home,
});

type ActiveOrder = {
  id: string;
  client_id: string;
  garment_type: string;
  delivery_date: string | null;
  status: string;
  ready_at: string | null;
};

function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24)));
}

function Home() {
  const t = useAppT("app_dashboard");
  const statusLabel = useOrderStatusLabel();
  const navigate = useNavigate();
  const { currentStore, currentRole } = useStore();
  const storeId = currentStore?.id;
  const canSeeMoney = currentRole === "owner" || currentRole === "manager";
  const firstName = useFirstName();
  const location = [currentStore?.city, "Nigeria"].filter(Boolean).join(", ");

  const { data: messagesFeature } = useFeature(storeId, "whatsapp_auto");
  const { data: onTimeBadgeFeature } = useFeature(storeId, "on_time_badge");
  const { data: capacityPlanningFeature } = useFeature(storeId, "capacity_planning");
  const { data: messageTopups } = useMessageTopups(storeId);
  const messagesLimit =
    typeof messagesFeature?.limit === "number"
      ? messagesFeature.limit + (messageTopups ?? 0)
      : null;
  const messagesUsageRatio =
    messagesLimit && messagesLimit > 0 ? (messagesFeature?.used ?? 0) / messagesLimit : 0;
  const messagesRunningLow = canSeeMoney && messagesUsageRatio >= 0.8;

  const today = startOfToday();
  const weekAhead = new Date(today);
  weekAhead.setDate(weekAhead.getDate() + 7);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["dashboard-stats", storeId],
    enabled: !!storeId && canSeeMoney,
    queryFn: async () => {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

      const [balancesRes, paymentsRes, ordersRes] = await Promise.all([
        supabase
          .from("order_balances")
          .select("balance, order_id")
          .eq("store_id", storeId as string)
          .gt("balance", 0),
        supabase
          .from("payments")
          .select("amount")
          .eq("store_id", storeId as string)
          .eq("voided", false)
          .gte("paid_at", startOfMonth),
        supabase
          .from("orders_for_tailor")
          .select("id, client_id, garment_type, delivery_date, status, ready_at, tracking_token")
          .eq("store_id", storeId as string)
          .not("status", "in", "(collected,cancelled)"),
      ]);
      if (balancesRes.error) throw balancesRes.error;
      if (paymentsRes.error) throw paymentsRes.error;
      if (ordersRes.error) throw ordersRes.error;

      const active = (ordersRes.data ?? []) as ActiveOrder[];
      const dueThisWeek = active.filter(
        (o) =>
          o.delivery_date &&
          new Date(o.delivery_date) >= today &&
          new Date(o.delivery_date) <= weekAhead,
      );
      const overdue = active.filter((o) => o.delivery_date && new Date(o.delivery_date) < today);
      const balanceByOrder = new Map((balancesRes.data ?? []).map((b) => [b.order_id, b.balance]));
      const statusCounts = new Map<string, number>();
      for (const o of active) {
        statusCounts.set(o.status, (statusCounts.get(o.status) ?? 0) + 1);
      }

      return {
        statusCounts,
        moneyOwed: (balancesRes.data ?? []).reduce((sum, b) => sum + (b.balance ?? 0), 0),
        owedOrdersCount: balancesRes.data?.length ?? 0,
        collectedThisMonth: (paymentsRes.data ?? []).reduce((sum, p) => sum + p.amount, 0),
        collectedCount: paymentsRes.data?.length ?? 0,
        dueThisWeekCount: dueThisWeek.length,
        overdueCount: overdue.length,
        activeCount: active.length,
        balanceByOrder,
        dueSoon: active
          .filter((o) => o.delivery_date)
          .sort(
            (a, b) =>
              new Date(a.delivery_date as string).getTime() -
              new Date(b.delivery_date as string).getTime(),
          )
          .slice(0, 5),
        uncollected: active
          .filter((o) => o.status === "ready" && o.ready_at)
          .sort(
            (a, b) =>
              new Date(a.ready_at as string).getTime() - new Date(b.ready_at as string).getTime(),
          ),
      };
    },
  });

  const trendDays = 14;
  const { data: revenueTrend } = useQuery({
    queryKey: ["dashboard-revenue-trend", storeId],
    enabled: !!storeId && canSeeMoney,
    queryFn: async () => {
      const trendStart = new Date(today);
      trendStart.setDate(trendStart.getDate() - (trendDays - 1));
      const { data, error } = await supabase
        .from("payments")
        .select("amount, paid_at")
        .eq("store_id", storeId as string)
        .eq("voided", false)
        .gte("paid_at", trendStart.toISOString());
      if (error) throw error;

      const byDay = new Map<string, number>();
      for (let i = 0; i < trendDays; i++) {
        const d = new Date(trendStart);
        d.setDate(d.getDate() + i);
        byDay.set(d.toISOString().slice(0, 10), 0);
      }
      for (const p of data ?? []) {
        const key = p.paid_at.slice(0, 10);
        byDay.set(key, (byDay.get(key) ?? 0) + p.amount);
      }
      return Array.from(byDay.entries()).map(([day, amount]) => ({
        day: new Date(day).toLocaleDateString(undefined, { day: "numeric", month: "short" }),
        amount,
      }));
    },
  });

  const { data: collection } = useQuery({
    queryKey: ["dashboard-collection", storeId],
    enabled: !!storeId && canSeeMoney,
    queryFn: async () => {
      const [balancesRes, ordersRes, paymentsRes, messagesRes] = await Promise.all([
        supabase
          .from("order_balances")
          .select("order_id, balance, total")
          .eq("store_id", storeId as string),
        supabase
          .from("orders")
          .select("id, created_at")
          .eq("store_id", storeId as string)
          .neq("status", "cancelled"),
        supabase
          .from("payments")
          .select("order_id, amount, paid_at")
          .eq("store_id", storeId as string)
          .eq("voided", false),
        supabase
          .from("messages")
          .select("order_id, created_at")
          .eq("store_id", storeId as string)
          .not("order_id", "is", null),
      ]);
      if (balancesRes.error) throw balancesRes.error;
      if (ordersRes.error) throw ordersRes.error;
      if (paymentsRes.error) throw paymentsRes.error;
      if (messagesRes.error) throw messagesRes.error;

      const balances = balancesRes.data ?? [];
      const orders = ordersRes.data ?? [];
      const payments = paymentsRes.data ?? [];
      const messages = messagesRes.data ?? [];

      const orderCreatedAt = new Map(orders.map((o) => [o.id, o.created_at]));
      const pricedOrders = balances.filter((b) => (b.total ?? 0) > 0);
      const fullyPaid = pricedOrders.filter((b) => (b.balance ?? 0) <= 0);

      const paymentsByOrder = new Map<string, { amount: number; paid_at: string }[]>();
      for (const p of payments) {
        if (!p.order_id) continue;
        const list = paymentsByOrder.get(p.order_id) ?? [];
        list.push({ amount: p.amount, paid_at: p.paid_at });
        paymentsByOrder.set(p.order_id, list);
      }

      const daysToPay: number[] = [];
      for (const b of fullyPaid) {
        if (!b.order_id) continue;
        const created = orderCreatedAt.get(b.order_id);
        const orderPayments = paymentsByOrder.get(b.order_id) ?? [];
        if (!created || orderPayments.length === 0) continue;
        const lastPaidAt = orderPayments.reduce(
          (latest, p) => Math.max(latest, new Date(p.paid_at).getTime()),
          0,
        );
        const days = (lastPaidAt - new Date(created).getTime()) / 86_400_000;
        if (days >= 0) daysToPay.push(days);
      }
      const avgDaysToPay =
        daysToPay.length > 0 ? daysToPay.reduce((a, b) => a + b, 0) / daysToPay.length : null;

      const lastMessageByOrder = new Map<string, string>();
      for (const m of messages) {
        if (!m.order_id) continue;
        const existing = lastMessageByOrder.get(m.order_id);
        if (!existing || m.created_at > existing) lastMessageByOrder.set(m.order_id, m.created_at);
      }
      let recoveredAfterReminder = 0;
      for (const p of payments) {
        if (!p.order_id) continue;
        const lastMessageAt = lastMessageByOrder.get(p.order_id);
        if (lastMessageAt && p.paid_at > lastMessageAt) recoveredAfterReminder += p.amount;
      }

      const totalCollected = payments.reduce((sum, p) => sum + p.amount, 0);
      const paidShare = pricedOrders.length > 0 ? fullyPaid.length / pricedOrders.length : 1;

      const paidShareScore = Math.round(paidShare * 50);
      const speedScore =
        avgDaysToPay === null ? 25 : Math.max(0, Math.round(30 - avgDaysToPay * 2));
      const pickupScore = Math.max(0, 20 - (stats?.uncollected.length ?? 0) * 4);
      const score = Math.max(0, Math.min(100, paidShareScore + speedScore + pickupScore));

      return { totalCollected, recoveredAfterReminder, score };
    },
  });

  const collectionAdvice = (() => {
    const uncollectedCount = stats?.uncollected.length ?? 0;
    if (uncollectedCount > 0) {
      return {
        text:
          t("advice_uncollected", { count: uncollectedCount }) ||
          `${uncollectedCount} garment(s) waiting for pickup. Send reminders now.`,
        actionLabel: t("action_see_uncollected") || "See uncollected",
        actionKind: "see_uncollected" as const,
      };
    }
    if (collection && collection.score < 70) {
      return {
        text:
          t("advice_unpaid") ||
          "Some balances are still unpaid. Follow up with clients who owe you.",
        actionLabel: t("action_view_orders") || "View orders",
        actionKind: "view_orders" as const,
      };
    }
    return {
      text: t("advice_good") || "You're collecting well. Keep it up.",
      actionLabel: undefined,
      actionKind: undefined,
    };
  })();

  const relatedClientIds = useMemo(
    () => [
      ...new Set(
        [...(stats?.dueSoon ?? []), ...(stats?.uncollected ?? [])].map((o) => o.client_id),
      ),
    ],
    [stats],
  );
  const { data: relatedClients } = useQuery({
    queryKey: ["dashboard-related-clients", relatedClientIds],
    enabled: relatedClientIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, full_name, phone, whatsapp_phone, consent_whatsapp, preferred_language")
        .in("id", relatedClientIds);
      if (error) throw error;
      return data;
    },
  });
  const clientById = (id: string) => relatedClients?.find((c) => c.id === id);
  const clientName = (id: string) => clientById(id)?.full_name ?? "—";

  const statusChartData = ORDER_STATUSES_DB.filter((status) => status !== "collected")
    .map((status) => ({
      status: statusLabel(status),
      count: stats?.statusCounts.get(status) ?? 0,
    }))
    .filter((row) => row.count > 0);

  const { data: myJobs, isLoading: myJobsLoading } = useQuery({
    queryKey: ["dashboard-my-jobs", storeId],
    enabled: !!storeId && !canSeeMoney,
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("orders_for_tailor")
        .select("*")
        .eq("store_id", storeId as string)
        .eq("assigned_to", userData.user?.id as string)
        .not("status", "in", "(collected,cancelled)")
        .order("delivery_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-5xl px-4 py-6 lg:px-8 lg:py-10">
        <p className="text-xs uppercase tracking-[0.18em] text-gold">{location}</p>
        <h1 className="mt-2 text-3xl leading-tight lg:text-4xl">
          {t(greetingKey()) || GREETING_FALLBACK[greetingKey()]}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("tagline") || "Every order tracked. Every naira collected."}
        </p>

        <StitchDivider className="my-6" />

        <DashboardOverview storeId={storeId} />

        {canSeeMoney && (
          <div className="mb-6">
            <TodayCard storeId={storeId} />
          </div>
        )}

        {canSeeMoney && currentStore && new Date(currentStore.trial_ends_at) > new Date() && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold/40 bg-accent/40 px-4 py-3">
            <p className="text-sm">
              <span className="font-medium text-gold">
                {t("trial_days_left", { count: trialDaysLeft(currentStore.trial_ends_at) }) ||
                  `${trialDaysLeft(currentStore.trial_ends_at)} days left`}
              </span>{" "}
              {t("trial_banner_suffix") || "on your Growth trial."}
            </p>
            <Button size="sm" variant="outline" asChild>
              <Link to="/billing">{t("upgrade_now") || "Upgrade now"}</Link>
            </Button>
          </div>
        )}

        {messagesRunningLow && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-owed/40 bg-owed/10 px-4 py-3">
            <p className="text-sm">
              {t("messages_running_low", {
                used: messagesFeature?.used ?? 0,
                limit: messagesLimit ?? 0,
              }) ||
                `You've used ${messagesFeature?.used} of ${messagesLimit} automatic WhatsApp messages this month. Tap-to-send stays free and unlimited either way.`}
            </p>
            {WHATSAPP_AUTO_TOPUP_ENABLED && (
              <Button size="sm" variant="outline" asChild>
                <Link to="/billing">{t("top_up_messages") || "Top up messages"}</Link>
              </Button>
            )}
          </div>
        )}

        {canSeeMoney && <MilestoneCelebration storeId={storeId} />}
        {canSeeMoney && <MomentsSection storeId={storeId} />}

        <section className="mb-10">
          <SectionHeader eyebrow="Ahead" title={t("coming_up_title") || "Coming up"} />
          <div className="mt-4 space-y-6">
            <ComingUpCard storeId={storeId} />
            <DailyWorkPlan storeId={storeId} />
          </div>
        </section>

        {canSeeMoney ? (
          <>
            <SectionHeader eyebrow="This month" title={t("this_month_title") || "Your numbers"} />
            {collection && (
              <div className="mt-4 mb-6 grid gap-3 lg:grid-cols-2">
                <Card className="rounded-2xl border-gold/30">
                  <CardContent className="p-5">
                    <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground">
                      {t("collected_label") || "Jaylor has helped you collect"}
                    </p>
                    <MoneyText
                      amount={collection.totalCollected}
                      variant="paid"
                      className="mt-1 text-2xl"
                    />
                    {collection.recoveredAfterReminder > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("recovered_prefix") || "Including"}{" "}
                        <MoneyText
                          amount={collection.recoveredAfterReminder}
                          variant="paid"
                          className="inline text-xs"
                        />{" "}
                        {t("recovered_suffix") || "recovered after a reminder"}
                      </p>
                    )}
                  </CardContent>
                </Card>
                <CollectionScoreCard
                  score={collection.score}
                  advice={collectionAdvice.text}
                  actionLabel={collectionAdvice.actionLabel}
                  onAction={() => {
                    if (collectionAdvice.actionKind === "see_uncollected") {
                      document
                        .getElementById("uncollected")
                        ?.scrollIntoView({ behavior: "smooth" });
                    } else {
                      navigate({ to: "/orders" });
                    }
                  }}
                />
              </div>
            )}

            {storeId && (onTimeBadgeFeature?.allowed || capacityPlanningFeature?.allowed) && (
              <div className="mb-6 grid gap-3 lg:grid-cols-2">
                {onTimeBadgeFeature?.allowed && <OnTimeScoreCard storeId={storeId} />}
                {capacityPlanningFeature?.allowed && <CapacityLoadChart storeId={storeId} />}
              </div>
            )}

            {storeId && <LowStockCard storeId={storeId} />}

            {statsLoading ? (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 rounded-2xl" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat
                  label={t("stat_money_owed") || "Money owed"}
                  value={<MoneyText amount={stats?.moneyOwed ?? 0} variant="owed" />}
                  hint={
                    t("stat_money_owed_hint", { count: stats?.owedOrdersCount ?? 0 }) ||
                    `${stats?.owedOrdersCount ?? 0} orders`
                  }
                  icon={Wallet}
                />
                <Stat
                  label={t("stat_collected_month") || "Collected this month"}
                  value={<MoneyText amount={stats?.collectedThisMonth ?? 0} variant="paid" />}
                  hint={
                    t("stat_collected_hint", { count: stats?.collectedCount ?? 0 }) ||
                    `${stats?.collectedCount ?? 0} payments`
                  }
                  icon={Banknote}
                />
                <Stat
                  label={t("stat_due_week") || "Due this week"}
                  value={<span className="figures text-2xl">{stats?.dueThisWeekCount ?? 0}</span>}
                  hint={
                    t("stat_due_week_hint", { count: stats?.overdueCount ?? 0 }) ||
                    `${stats?.overdueCount ?? 0} overdue`
                  }
                  icon={CalendarClock}
                />
                <Stat
                  label={t("stat_in_workroom") || "In the workroom"}
                  value={<span className="figures text-2xl">{stats?.activeCount ?? 0}</span>}
                  hint={t("stat_active_hint") || "Active jobs"}
                  icon={Package}
                />
              </div>
            )}

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <Card className="rounded-2xl">
                <CardContent className="p-5">
                  <p className="font-medium">
                    {t("revenue_chart_title", { count: trendDays }) ||
                      `Revenue, last ${trendDays} days`}
                  </p>
                  {!revenueTrend ? (
                    <Skeleton className="mt-3 h-40 rounded-xl" />
                  ) : (
                    <ChartContainer
                      config={{
                        amount: {
                          label: t("revenue_label") || "Revenue",
                          color: "var(--color-viz-1)",
                        },
                      }}
                      className="mt-3 h-40 w-full"
                    >
                      <AreaChart data={revenueTrend}>
                        <defs>
                          <linearGradient id="dashboard-revenue-fill" x1="0" y1="0" x2="0" y2="1">
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
                          width={44}
                          tickFormatter={(v: number) => compactMoney(v)}
                        />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Area
                          type="monotone"
                          dataKey="amount"
                          stroke="var(--color-amount)"
                          strokeWidth={2}
                          fill="url(#dashboard-revenue-fill)"
                        />
                      </AreaChart>
                    </ChartContainer>
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-2xl">
                <CardContent className="p-5">
                  <p className="font-medium">
                    {t("workroom_chart_title") || "Orders in the workroom"}
                  </p>
                  {statusChartData.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                      {t("nothing_in_progress") || "Nothing in progress right now."}
                    </p>
                  ) : (
                    <ChartContainer
                      config={{
                        count: {
                          label: t("orders_label") || "Orders",
                          color: "var(--color-viz-2)",
                        },
                      }}
                      className="mt-3 h-40 w-full"
                    >
                      <BarChart data={statusChartData} layout="vertical">
                        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                        <XAxis
                          type="number"
                          tickLine={false}
                          axisLine={false}
                          allowDecimals={false}
                        />
                        <YAxis
                          type="category"
                          dataKey="status"
                          tickLine={false}
                          axisLine={false}
                          width={80}
                        />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="count" fill="var(--color-count)" radius={4} />
                      </BarChart>
                    </ChartContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            <section className="mt-10">
              <div className="flex items-end justify-between">
                <SectionHeader eyebrow="Workroom" title={t("due_soon_title") || "Due soon"} />
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/orders">{t("view_all") || "View all"}</Link>
                </Button>
              </div>
              <div className="mt-3 space-y-3">
                {!stats || stats.dueSoon.length === 0 ? (
                  <EmptyState
                    title={t("empty_due_title") || "Nothing due yet"}
                    description={
                      t("empty_due_description") ||
                      "Orders with a delivery date will show up here first."
                    }
                  />
                ) : (
                  stats.dueSoon.map((o) => {
                    const statusIndex = ORDER_STATUSES_DB.indexOf(
                      o.status as (typeof ORDER_STATUSES_DB)[number],
                    );
                    return (
                      <Link key={o.id} to="/orders/$orderId" params={{ orderId: o.id }}>
                        <Card className="rounded-2xl transition-colors hover:bg-accent/40">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate font-medium">{clientName(o.client_id)}</p>
                                <p className="truncate text-sm text-muted-foreground">
                                  {o.garment_type}
                                </p>
                              </div>
                              <Badge variant="outline" className="shrink-0 border-gold text-gold">
                                {o.delivery_date
                                  ? new Date(o.delivery_date).toLocaleDateString()
                                  : ""}
                              </Badge>
                            </div>
                            {statusIndex >= 0 && (
                              <StitchTrack
                                steps={ORDER_STATUSES_DB.map(statusLabel)}
                                currentIndex={statusIndex}
                                className="mt-5"
                              />
                            )}
                          </CardContent>
                        </Card>
                      </Link>
                    );
                  })
                )}
              </div>
            </section>

            {stats && stats.uncollected.length > 0 && (
              <section id="uncollected" className="mt-10 scroll-mt-20">
                <SectionHeader
                  eyebrow="Workroom"
                  title={t("uncollected_title") || "Uncollected"}
                  description={t("uncollected_subtitle") || "Ready and waiting for pickup."}
                />
                <div className="mt-3 space-y-3">
                  {stats.uncollected.map((o) => {
                    const client = clientById(o.client_id);
                    const balance = stats.balanceByOrder.get(o.id) ?? 0;
                    const trackingToken = (o as { tracking_token?: string | null }).tracking_token;
                    const trackingUrl = trackingToken
                      ? `${window.location.origin}/t/${trackingToken}`
                      : null;
                    return (
                      <Card key={o.id} className="rounded-2xl">
                        <CardContent className="flex items-center justify-between gap-3 p-4">
                          <Link
                            to="/orders/$orderId"
                            params={{ orderId: o.id }}
                            className="min-w-0 flex-1"
                          >
                            <p className="truncate font-medium">{clientName(o.client_id)}</p>
                            <p className="truncate text-sm text-muted-foreground">
                              {o.garment_type} ·{" "}
                              {t("waiting_days", { count: daysSince(o.ready_at as string) }) ||
                                `waiting ${daysSince(o.ready_at as string)} day(s)`}
                            </p>
                          </Link>
                          {client && currentStore && (
                            <RemindButton
                              storeId={currentStore.id}
                              clientId={client.id}
                              orderId={o.id}
                              phone={client.whatsapp_phone ?? client.phone}
                              consentWhatsapp={client.consent_whatsapp}
                              template="order_ready"
                              message={orderReadyMessageI18n(
                                resolveMessageLanguage(
                                  client.preferred_language,
                                  currentStore.language,
                                ),
                                client.full_name,
                                o.garment_type,
                                currentStore.name,
                                balance,
                                trackingUrl,
                              )}
                              label={t("remind_label") || "Remind"}
                            />
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="mt-10">
              <SectionHeader
                eyebrow="Upgrade"
                title={t("grow_title") || "Grow with Business"}
                description={
                  t("grow_subtitle") ||
                  "Locked features stay visible, so you always know what is next."
                }
              />
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <LockedFeature
                  tier="Business"
                  title={t("staff_board_title") || "Staff job board"}
                  value={
                    t("staff_board_value") ||
                    "Assign jobs to tailors and see each person's workload at a glance."
                  }
                >
                  <Card className="rounded-2xl">
                    <CardContent className="p-5">
                      <p className="font-medium">{t("staff_board_title") || "Staff job board"}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t("staff_board_hint") || "See jobs by tailor at a glance"}
                      </p>
                    </CardContent>
                  </Card>
                </LockedFeature>
                <LockedFeature
                  tier="Business"
                  title={t("expenses_title") || "Expenses and net profit"}
                  value={
                    t("expenses_value") ||
                    "Track fabric, transport and staff costs to see what you really keep."
                  }
                >
                  <Card className="rounded-2xl">
                    <CardContent className="p-5">
                      <p className="font-medium">
                        {t("expenses_title") || "Expenses and net profit"}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t("expenses_hint") || "See what you really keep"}
                      </p>
                    </CardContent>
                  </Card>
                </LockedFeature>
              </div>
            </section>
          </>
        ) : (
          <section>
            <h2 className="text-xl">{t("my_jobs_title") || "My jobs"}</h2>
            {myJobsLoading ? (
              <div className="mt-3 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 rounded-2xl" />
                ))}
              </div>
            ) : !myJobs || myJobs.length === 0 ? (
              <EmptyState
                className="mt-6"
                title={t("empty_jobs_title") || "No jobs assigned yet"}
                description={
                  t("empty_jobs_description") ||
                  "Orders assigned to you will show up here, soonest due first."
                }
              />
            ) : (
              <div className="mt-3 space-y-3">
                {myJobs.map((o) => {
                  const statusIndex = ORDER_STATUSES_DB.indexOf(
                    o.status as (typeof ORDER_STATUSES_DB)[number],
                  );
                  return (
                    <Link key={o.id} to="/orders/$orderId" params={{ orderId: o.id ?? "" }}>
                      <Card className="rounded-2xl transition-colors hover:bg-accent/40">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <p className="truncate font-medium">{o.garment_type}</p>
                            {o.delivery_date && (
                              <Badge variant="outline" className="shrink-0 border-gold text-gold">
                                {new Date(o.delivery_date).toLocaleDateString()}
                              </Badge>
                            )}
                          </div>
                          {statusIndex >= 0 && (
                            <StitchTrack
                              steps={ORDER_STATUSES_DB.map(statusLabel)}
                              currentIndex={statusIndex}
                              className="mt-5"
                            />
                          )}
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  hint: string;
  icon?: typeof Wallet;
}) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-4">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="size-3.5 text-gold" />}
          <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
        </div>
        <p className="mt-2 text-2xl">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
