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
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useStore } from "@/lib/store-context";
import { supabase } from "@/integrations/supabase/client";
import { ORDER_STATUSES_DB, orderStatusLabel } from "@/lib/jaylor";
import { orderReadyMessage } from "@/lib/whatsapp";

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

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
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
  const navigate = useNavigate();
  const { currentStore, currentRole } = useStore();
  const storeId = currentStore?.id;
  const canSeeMoney = currentRole === "owner" || currentRole === "manager";
  const firstName = useFirstName();
  const location = [currentStore?.city, "Nigeria"].filter(Boolean).join(", ");

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
          .select("id, client_id, garment_type, delivery_date, status, ready_at")
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

      return {
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
        text: `${uncollectedCount} garment${uncollectedCount === 1 ? "" : "s"} ${uncollectedCount === 1 ? "is" : "are"} waiting for pickup. Send reminders now.`,
        actionLabel: "See uncollected",
      };
    }
    if (collection && collection.score < 70) {
      return {
        text: "Some balances are still unpaid. Follow up with clients who owe you.",
        actionLabel: "View orders",
      };
    }
    return { text: "You're collecting well. Keep it up.", actionLabel: undefined };
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
        .select("id, full_name, phone, whatsapp_phone, consent_whatsapp")
        .in("id", relatedClientIds);
      if (error) throw error;
      return data;
    },
  });
  const clientById = (id: string) => relatedClients?.find((c) => c.id === id);
  const clientName = (id: string) => clientById(id)?.full_name ?? "—";

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
          {greeting()}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Every order tracked. Every naira collected.
        </p>

        <StitchDivider className="my-6" />

        {canSeeMoney && currentStore && new Date(currentStore.trial_ends_at) > new Date() && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold/40 bg-accent/40 px-4 py-3">
            <p className="text-sm">
              <span className="font-medium text-gold">
                {Math.max(
                  0,
                  Math.ceil(
                    (new Date(currentStore.trial_ends_at).getTime() - Date.now()) /
                      (1000 * 60 * 60 * 24),
                  ),
                )}{" "}
                days left
              </span>{" "}
              on your Growth trial.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => toast("Billing isn't set up yet — coming soon")}
            >
              Upgrade now
            </Button>
          </div>
        )}

        {canSeeMoney ? (
          <>
            {collection && (
              <div className="mb-6 grid gap-3 lg:grid-cols-2">
                <Card className="rounded-2xl border-gold/30">
                  <CardContent className="p-5">
                    <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground">
                      Jaylor has helped you collect
                    </p>
                    <MoneyText
                      amount={collection.totalCollected}
                      variant="paid"
                      className="mt-1 text-2xl"
                    />
                    {collection.recoveredAfterReminder > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Including{" "}
                        <MoneyText
                          amount={collection.recoveredAfterReminder}
                          variant="paid"
                          className="inline text-xs"
                        />{" "}
                        recovered after a reminder
                      </p>
                    )}
                  </CardContent>
                </Card>
                <CollectionScoreCard
                  score={collection.score}
                  advice={collectionAdvice.text}
                  actionLabel={collectionAdvice.actionLabel}
                  onAction={() => {
                    if (collectionAdvice.actionLabel === "See uncollected") {
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

            {statsLoading ? (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 rounded-2xl" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat
                  label="Money owed"
                  value={<MoneyText amount={stats?.moneyOwed ?? 0} variant="owed" />}
                  hint={`${stats?.owedOrdersCount ?? 0} orders`}
                />
                <Stat
                  label="Collected this month"
                  value={<MoneyText amount={stats?.collectedThisMonth ?? 0} variant="paid" />}
                  hint={`${stats?.collectedCount ?? 0} payments`}
                />
                <Stat
                  label="Due this week"
                  value={<span className="figures text-2xl">{stats?.dueThisWeekCount ?? 0}</span>}
                  hint={`${stats?.overdueCount ?? 0} overdue`}
                />
                <Stat
                  label="In the workroom"
                  value={<span className="figures text-2xl">{stats?.activeCount ?? 0}</span>}
                  hint="Active jobs"
                />
              </div>
            )}

            <section className="mt-8">
              <div className="flex items-end justify-between">
                <h2 className="text-xl">Due soon</h2>
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/orders">View all</Link>
                </Button>
              </div>
              <div className="mt-3 space-y-3">
                {!stats || stats.dueSoon.length === 0 ? (
                  <EmptyState
                    title="Nothing due yet"
                    description="Orders with a delivery date will show up here first."
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
                                steps={ORDER_STATUSES_DB.map(orderStatusLabel)}
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
                <h2 className="text-xl">Uncollected</h2>
                <p className="mt-1 text-sm text-muted-foreground">Ready and waiting for pickup.</p>
                <div className="mt-3 space-y-3">
                  {stats.uncollected.map((o) => {
                    const client = clientById(o.client_id);
                    const balance = stats.balanceByOrder.get(o.id) ?? 0;
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
                              {o.garment_type} · waiting {daysSince(o.ready_at as string)}{" "}
                              {daysSince(o.ready_at as string) === 1 ? "day" : "days"}
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
                              message={orderReadyMessage(
                                client.full_name,
                                o.garment_type,
                                currentStore.name,
                                balance,
                              )}
                              label="Remind"
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
              <h2 className="text-xl">Grow with Business</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Locked features stay visible, so you always know what is next.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <LockedFeature
                  tier="Business"
                  title="Staff job board"
                  value="Assign jobs to tailors and see each person's workload at a glance."
                >
                  <Card className="rounded-2xl">
                    <CardContent className="p-5">
                      <p className="font-medium">Staff job board</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        See jobs by tailor at a glance
                      </p>
                    </CardContent>
                  </Card>
                </LockedFeature>
                <LockedFeature
                  tier="Business"
                  title="Expenses and net profit"
                  value="Track fabric, transport and staff costs to see what you really keep."
                >
                  <Card className="rounded-2xl">
                    <CardContent className="p-5">
                      <p className="font-medium">Expenses and net profit</p>
                      <p className="mt-1 text-sm text-muted-foreground">See what you really keep</p>
                    </CardContent>
                  </Card>
                </LockedFeature>
              </div>
            </section>
          </>
        ) : (
          <section>
            <h2 className="text-xl">My jobs</h2>
            {myJobsLoading ? (
              <div className="mt-3 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 rounded-2xl" />
                ))}
              </div>
            ) : !myJobs || myJobs.length === 0 ? (
              <EmptyState
                className="mt-6"
                title="No jobs assigned yet"
                description="Orders assigned to you will show up here, soonest due first."
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
                              steps={ORDER_STATUSES_DB.map(orderStatusLabel)}
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

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint: string }) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
