import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/jaylor/app-shell";
import { EmptyState } from "@/components/jaylor/empty-state";
import { OrderForm } from "@/components/jaylor/order-form";
import { StitchTrack } from "@/components/jaylor/stitch-track";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store-context";
import { ORDER_STATUSES_DB, orderStatusLabel } from "@/lib/jaylor";

export const Route = createFileRoute("/_authenticated/orders/")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Orders — Jaylor" },
      {
        name: "description",
        content:
          "Track every garment from Received to Collected, with fittings, balances and delivery dates.",
      },
      { property: "og:title", content: "Orders — Jaylor" },
      {
        property: "og:description",
        content: "Track every garment from Received to Collected in one calm workroom view.",
      },
    ],
  }),
  component: Orders,
});

type TabKey = "active" | "due_this_week" | "overdue" | "ready" | "collected";

const TABS: { key: TabKey; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "due_this_week", label: "Due this week" },
  { key: "overdue", label: "Overdue" },
  { key: "ready", label: "Ready" },
  { key: "collected", label: "Collected" },
];

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function Orders() {
  const { currentStore, currentRole } = useStore();
  const storeId = currentStore?.id;
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>("active");
  const [formOpen, setFormOpen] = useState(false);
  const canCreate = currentRole === "owner" || currentRole === "manager";

  const { data: orders, isLoading } = useQuery({
    queryKey: ["orders", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders_for_tailor")
        .select("*")
        .eq("store_id", storeId as string)
        .order("delivery_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });

  const clientIds = useMemo(
    () => [...new Set((orders ?? []).map((o) => o.client_id).filter((id): id is string => id != null))],
    [orders],
  );
  const { data: clients } = useQuery({
    queryKey: ["orders-clients", clientIds],
    enabled: clientIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, full_name")
        .in("id", clientIds);
      if (error) throw error;
      return data;
    },
  });
  const clientName = (id: string) => clients?.find((c) => c.id === id)?.full_name ?? "—";

  const today = startOfToday();
  const weekAhead = new Date(today);
  weekAhead.setDate(weekAhead.getDate() + 7);

  const filtered = (orders ?? []).filter((o) => {
    const due = o.delivery_date ? new Date(o.delivery_date) : null;
    switch (tab) {
      case "active":
        return o.status !== "collected" && o.status !== "cancelled";
      case "due_this_week":
        return (
          !!due &&
          due >= today &&
          due <= weekAhead &&
          o.status !== "collected" &&
          o.status !== "cancelled"
        );
      case "overdue":
        return !!due && due < today && o.status !== "collected" && o.status !== "cancelled";
      case "ready":
        return o.status === "ready";
      case "collected":
        return o.status === "collected";
      default:
        return false;
    }
  });

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-5xl px-4 py-6 lg:px-8 lg:py-10">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-3xl">Orders</h1>
          {canCreate && (
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="size-4" />
              New order
            </Button>
          )}
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="mt-4">
          <TabsList className="w-full justify-start overflow-x-auto">
            {TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {isLoading ? (
          <div className="mt-6 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            className="mt-10"
            title="No orders here"
            description="Create your first order and Jaylor will track it from cutting to collection."
            action={
              canCreate ? <Button onClick={() => setFormOpen(true)}>New order</Button> : undefined
            }
          />
        ) : (
          <div className="mt-4 space-y-3">
            {filtered.map((order) => {
              const due = order.delivery_date ? new Date(order.delivery_date) : null;
              const overdue = !!due && due < today && order.status !== "collected";
              const statusIndex = ORDER_STATUSES_DB.indexOf(
                order.status as (typeof ORDER_STATUSES_DB)[number],
              );
              return (
                <Link
                  key={order.id}
                  to="/orders/$orderId"
                  params={{ orderId: order.id ?? "" }}
                  className="block rounded-2xl border border-border p-4 transition-colors hover:bg-accent/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{clientName(order.client_id ?? "")}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {order.garment_type} · {order.number}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {order.priority === "rush" && (
                        <Badge variant="outline" className="border-owed text-owed">
                          Rush
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className={overdue ? "border-owed text-owed" : "border-gold text-gold"}
                      >
                        {due ? due.toLocaleDateString() : "No date"}
                      </Badge>
                    </div>
                  </div>
                  {statusIndex >= 0 && (
                    <StitchTrack
                      steps={ORDER_STATUSES_DB.map(orderStatusLabel)}
                      currentIndex={statusIndex}
                      compact
                      className="mt-4"
                    />
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {storeId && (
        <OrderForm
          open={formOpen}
          onOpenChange={setFormOpen}
          storeId={storeId}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["orders", storeId] })}
        />
      )}
    </AppShell>
  );
}
