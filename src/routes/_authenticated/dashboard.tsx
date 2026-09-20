import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/jaylor/app-shell";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { StitchTrack } from "@/components/jaylor/stitch-track";
import { MoneyText } from "@/components/jaylor/money-text";
import { EmptyState } from "@/components/jaylor/empty-state";
import { LockedFeature } from "@/components/jaylor/locked-feature";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useStore } from "@/lib/store-context";
import { supabase } from "@/integrations/supabase/client";
import { ORDER_STATUSES_DB, orderStatusLabel } from "@/lib/jaylor";

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
  head: () => ({
    meta: [
      { title: "Jaylor — Every order tracked. Every naira collected." },
      {
        name: "description",
        content:
          "Jaylor is the premium business app for tailors and fashion houses: orders, measurements, payments and reminders in one calm place.",
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
};

function Home() {
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
          .select("id, client_id, garment_type, delivery_date, status")
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

      return {
        moneyOwed: (balancesRes.data ?? []).reduce((sum, b) => sum + b.balance, 0),
        owedOrdersCount: balancesRes.data?.length ?? 0,
        collectedThisMonth: (paymentsRes.data ?? []).reduce((sum, p) => sum + p.amount, 0),
        collectedCount: paymentsRes.data?.length ?? 0,
        dueThisWeekCount: dueThisWeek.length,
        overdueCount: overdue.length,
        activeCount: active.length,
        dueSoon: active
          .filter((o) => o.delivery_date)
          .sort(
            (a, b) =>
              new Date(a.delivery_date as string).getTime() -
              new Date(b.delivery_date as string).getTime(),
          )
          .slice(0, 5),
      };
    },
  });

  const dueSoonClientIds = useMemo(
    () => [...new Set((stats?.dueSoon ?? []).map((o) => o.client_id))],
    [stats],
  );
  const { data: dueSoonClients } = useQuery({
    queryKey: ["dashboard-due-soon-clients", dueSoonClientIds],
    enabled: dueSoonClientIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, full_name")
        .in("id", dueSoonClientIds);
      if (error) throw error;
      return data;
    },
  });
  const clientName = (id: string) => dueSoonClients?.find((c) => c.id === id)?.full_name ?? "—";

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

        {canSeeMoney ? (
          <>
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
                    <Link key={o.id} to="/orders/$orderId" params={{ orderId: o.id }}>
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
