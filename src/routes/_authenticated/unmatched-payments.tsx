import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Plus, X } from "lucide-react";
import { AppShell } from "@/components/jaylor/app-shell";
import { EmptyState } from "@/components/jaylor/empty-state";
import { MoneyText } from "@/components/jaylor/money-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store-context";
import { useOnlineStatus } from "@/lib/use-online-status";
import { formatMoney } from "@/lib/jaylor";
import { getErrorMessage } from "@/lib/utils";
import { notifyTransferAssigned } from "@/lib/digest.functions";

export const Route = createFileRoute("/_authenticated/unmatched-payments")({
  staticData: { sitemap: false },
  head: () => ({ meta: [{ title: "Unmatched payments — Jaylor" }] }),
  component: UnmatchedPayments,
});

type Transfer = {
  id: string;
  amount: number;
  sender_name: string | null;
  sender_bank: string | null;
  received_at: string;
};

type OpenOrder = {
  order_id: string;
  number: string;
  garment_type: string;
  client_name: string;
  balance: number;
};

function UnmatchedPayments() {
  const { currentStore } = useStore();
  const storeId = currentStore?.id;
  const online = useOnlineStatus();
  const queryClient = useQueryClient();
  const [assigning, setAssigning] = useState<Transfer | null>(null);

  const { data: transfers, isLoading } = useQuery({
    queryKey: ["unmatched-transfers", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incoming_transfers")
        .select("id, amount, sender_name, sender_bank, received_at")
        .eq("store_id", storeId as string)
        .eq("status", "unmatched")
        .order("received_at", { ascending: false });
      if (error) throw error;
      return data as Transfer[];
    },
  });

  async function ignore(transfer: Transfer) {
    try {
      const { error } = await supabase.rpc("ignore_incoming_transfer", {
        p_transfer_id: transfer.id,
      });
      if (error) throw error;
      toast.success("Transfer ignored");
      queryClient.invalidateQueries({ queryKey: ["unmatched-transfers", storeId] });
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not ignore this transfer"));
    }
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-6 lg:px-8 lg:py-10">
        <Link
          to="/payments"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground"
        >
          <ArrowLeft className="size-4" />
          Payments
        </Link>
        <h1 className="mt-3 text-3xl">Unmatched payments</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bank transfers to your business account number that Jaylor couldn't confidently match to
          an order. Assign them by hand below.
        </p>

        <div className="mt-4 space-y-2">
          {isLoading ? (
            <>
              <Skeleton className="h-16 rounded-xl" />
              <Skeleton className="h-16 rounded-xl" />
            </>
          ) : !transfers || transfers.length === 0 ? (
            <EmptyState
              title="Nothing to match"
              description="Unmatched transfers will show up here."
            />
          ) : (
            transfers.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
              >
                <div className="min-w-0">
                  <p className="figures text-sm font-medium">{formatMoney(t.amount)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t.sender_name ?? "Unknown sender"}
                    {t.sender_bank ? ` · ${t.sender_bank}` : ""} ·{" "}
                    {new Date(t.received_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="outline" onClick={() => ignore(t)} disabled={!online}>
                    Ignore
                  </Button>
                  <Button size="sm" onClick={() => setAssigning(t)} disabled={!online}>
                    Assign
                  </Button>
                </div>
              </div>
            ))
          )}
          {!online && (
            <p className="text-center text-xs text-muted-foreground">
              Assigning transfers needs a connection.
            </p>
          )}
        </div>
      </div>

      {assigning && (
        <AssignDialog
          transfer={assigning}
          storeId={storeId as string}
          onClose={() => setAssigning(null)}
          onAssigned={() => {
            setAssigning(null);
            queryClient.invalidateQueries({ queryKey: ["unmatched-transfers", storeId] });
          }}
        />
      )}
    </AppShell>
  );
}

function AssignDialog({
  transfer,
  storeId,
  onClose,
  onAssigned,
}: {
  transfer: Transfer;
  storeId: string;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<{ orderId: string; amount: string }[]>([
    { orderId: "", amount: String(transfer.amount) },
  ]);
  const [busy, setBusy] = useState(false);
  const runNotifyTransferAssigned = useServerFn(notifyTransferAssigned);

  const { data: openOrders, isLoading } = useQuery({
    queryKey: ["open-orders-for-match", storeId],
    queryFn: async () => {
      const { data: balances, error } = await supabase
        .from("order_balances")
        .select("order_id, balance")
        .eq("store_id", storeId)
        .gt("balance", 0);
      if (error) throw error;
      const orderIds = balances.map((b) => b.order_id).filter((id): id is string => !!id);
      if (orderIds.length === 0) return [] as OpenOrder[];

      const { data: orders } = await supabase
        .from("orders")
        .select("id, number, garment_type, client_id, status")
        .in("id", orderIds)
        .neq("status", "cancelled");
      const clientIds = [...new Set((orders ?? []).map((o) => o.client_id))];
      const { data: clients } = clientIds.length
        ? await supabase.from("clients").select("id, full_name").in("id", clientIds)
        : { data: [] };
      const clientById = new Map((clients ?? []).map((c) => [c.id, c.full_name]));
      const balanceByOrder = new Map(balances.map((b) => [b.order_id, b.balance]));

      return (orders ?? []).map((o) => ({
        order_id: o.id,
        number: o.number,
        garment_type: o.garment_type,
        client_name: clientById.get(o.client_id) ?? "—",
        balance: balanceByOrder.get(o.id) ?? 0,
      })) as OpenOrder[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return openOrders ?? [];
    return (openOrders ?? []).filter(
      (o) => o.client_name.toLowerCase().includes(q) || o.number.toLowerCase().includes(q),
    );
  }, [openOrders, search]);

  const total = rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const remaining = transfer.amount - total;

  function setRow(index: number, patch: Partial<{ orderId: string; amount: string }>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function submit() {
    const allocations = rows
      .filter((r) => r.orderId && Number(r.amount) > 0)
      .map((r) => ({ order_id: r.orderId, amount: Number(r.amount) }));
    if (allocations.length === 0) {
      toast.error("Choose at least one order");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("assign_incoming_transfer", {
        p_transfer_id: transfer.id,
        p_allocations: allocations,
      });
      if (error) throw error;
      toast.success("Transfer assigned");
      if (allocations.length === 1) {
        // Best-effort owner alert -- the transfer is already recorded either way.
        runNotifyTransferAssigned({
          data: { storeId, orderId: allocations[0]!.order_id, transferId: transfer.id },
        }).catch(() => {});
      }
      onAssigned();
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not assign this transfer"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Assign <MoneyText amount={transfer.amount} className="inline" />
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          {transfer.sender_name ?? "Unknown sender"}
          {transfer.sender_bank ? ` · ${transfer.sender_bank}` : ""}
        </p>

        <Input
          placeholder="Search client or order number"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="space-y-3">
          {rows.map((row, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="flex-1 space-y-1">
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={row.orderId}
                  onChange={(e) => setRow(i, { orderId: e.target.value })}
                >
                  <option value="">{isLoading ? "Loading orders..." : "Choose an order"}</option>
                  {filtered.map((o) => (
                    <option key={o.order_id} value={o.order_id}>
                      {o.client_name} · {o.number} · {o.garment_type} (owes {formatMoney(o.balance)}
                      )
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-32">
                <MoneyInput value={row.amount} onChange={(v) => setRow(i, { amount: v })} />
              </div>
              {rows.length > 1 && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <X className="size-4" />
                </Button>
              )}
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setRows((prev) => [...prev, { orderId: "", amount: String(Math.max(remaining, 0)) }])
          }
        >
          <Plus className="size-4" />
          Split across another order
        </Button>

        <p className="text-sm text-muted-foreground">
          {remaining === 0
            ? "Fully allocated"
            : remaining > 0
              ? `${formatMoney(remaining)} left to allocate`
              : "Allocations exceed the transfer amount"}
        </p>

        <Button onClick={submit} disabled={busy || remaining < 0} className="w-full">
          {busy ? "Assigning..." : "Assign"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
