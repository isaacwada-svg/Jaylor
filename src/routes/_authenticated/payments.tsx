import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download } from "lucide-react";
import { AppShell } from "@/components/jaylor/app-shell";
import { EmptyState } from "@/components/jaylor/empty-state";
import { MoneyText } from "@/components/jaylor/money-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store-context";
import { downloadCsv } from "@/lib/csv";
import { formatMoney } from "@/lib/jaylor";

export const Route = createFileRoute("/_authenticated/payments")({
  staticData: { sitemap: false },
  head: () => ({ meta: [{ title: "Payments — Jaylor" }] }),
  component: PaymentsScreen,
});

type MethodFilter = "all" | "cash" | "transfer" | "pos" | "paystack";

function PaymentsScreen() {
  const { currentStore } = useStore();
  const storeId = currentStore?.id;
  const [method, setMethod] = useState<MethodFilter>("all");
  const [search, setSearch] = useState("");

  const { data: rows, isLoading } = useQuery({
    queryKey: ["payments-list", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data: payments, error } = await supabase
        .from("payments")
        .select("id, order_id, amount, method, reference, paid_at, voided")
        .eq("store_id", storeId as string)
        .order("paid_at", { ascending: false })
        .limit(500);
      if (error) throw error;

      const orderIds = [...new Set(payments.map((p) => p.order_id).filter(Boolean))] as string[];
      const { data: orders } = orderIds.length
        ? await supabase
            .from("orders")
            .select("id, number, garment_type, client_id")
            .in("id", orderIds)
        : { data: [] };
      const clientIds = [...new Set((orders ?? []).map((o) => o.client_id))];
      const { data: clients } = clientIds.length
        ? await supabase.from("clients").select("id, full_name").in("id", clientIds)
        : { data: [] };

      const orderById = new Map((orders ?? []).map((o) => [o.id, o]));
      const clientById = new Map((clients ?? []).map((c) => [c.id, c]));

      return payments.map((p) => {
        const order = p.order_id ? orderById.get(p.order_id) : undefined;
        const client = order ? clientById.get(order.client_id) : undefined;
        return {
          ...p,
          orderNumber: order?.number ?? "—",
          garmentType: order?.garment_type ?? "—",
          clientName: client?.full_name ?? "—",
        };
      });
    },
  });

  const filtered = useMemo(() => {
    return (rows ?? []).filter((r) => {
      if (r.voided) return false;
      if (method !== "all" && r.method !== method) return false;
      if (search.trim() && !r.clientName.toLowerCase().includes(search.trim().toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [rows, method, search]);

  const total = filtered.reduce((sum, r) => sum + r.amount, 0);

  function exportCsv() {
    const header = ["Date", "Client", "Order", "Garment", "Method", "Amount", "Reference"];
    const body = filtered.map((r) => [
      new Date(r.paid_at).toLocaleDateString(),
      r.clientName,
      r.orderNumber,
      r.garmentType,
      r.method,
      r.amount,
      r.reference ?? "",
    ]);
    downloadCsv(`jaylor-payments-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body]);
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-6 lg:px-8 lg:py-10">
        <Link to="/more" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <ArrowLeft className="size-4" />
          More
        </Link>
        <div className="mt-3 flex items-center justify-between gap-3">
          <h1 className="text-3xl">Payments</h1>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="size-4" />
            Export CSV
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client"
            className="max-w-xs"
          />
          <Select value={method} onValueChange={(v) => setMethod(v as MethodFilter)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All methods</SelectItem>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="transfer">Transfer</SelectItem>
              <SelectItem value="pos">POS</SelectItem>
              <SelectItem value="paystack">Paystack</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <p className="mt-3 text-sm text-muted-foreground">
          {filtered.length} payment{filtered.length === 1 ? "" : "s"} ·{" "}
          <MoneyText amount={total} variant="paid" className="inline" />
        </p>

        <div className="mt-4 space-y-2">
          {isLoading ? (
            <>
              <Skeleton className="h-14 rounded-xl" />
              <Skeleton className="h-14 rounded-xl" />
            </>
          ) : filtered.length === 0 ? (
            <EmptyState
              title="No payments yet"
              description="Recorded payments will show up here."
            />
          ) : (
            filtered.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.clientName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.orderNumber} · {p.garmentType} · {p.method}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="figures text-sm font-medium">{formatMoney(p.amount)}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(p.paid_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}
