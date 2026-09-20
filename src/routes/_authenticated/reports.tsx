import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addMonths, format, parse, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight, Download, Plus } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/jaylor/app-shell";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { ExpenseForm } from "@/components/jaylor/expense-form";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store-context";
import { formatMoney, EXPENSE_CATEGORIES } from "@/lib/jaylor";
import { downloadCsv } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/reports")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Reports — Jaylor" },
      {
        name: "description",
        content: "Revenue, expenses, net profit and business trends, month by month.",
      },
    ],
  }),
  component: Reports,
});

function categoryLabel(value: string) {
  return EXPENSE_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

function compactMoney(n: number) {
  return new Intl.NumberFormat("en-NG", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

function avgDays(pairs: { from: string; to: string }[]) {
  if (pairs.length === 0) return null;
  const totalMs = pairs.reduce(
    (sum, p) => sum + (new Date(p.to).getTime() - new Date(p.from).getTime()),
    0,
  );
  return Math.round(totalMs / pairs.length / 86_400_000);
}

function Reports() {
  const { currentStore } = useStore();
  const storeId = currentStore?.id;
  const queryClient = useQueryClient();
  const [monthValue, setMonthValue] = useState(() => format(new Date(), "yyyy-MM"));
  const [expenseFormOpen, setExpenseFormOpen] = useState(false);

  const monthStart = useMemo(() => parse(monthValue, "yyyy-MM", new Date()), [monthValue]);
  const monthEndExclusive = useMemo(() => addMonths(monthStart, 1), [monthStart]);
  const trendStart = useMemo(() => subMonths(monthStart, 11), [monthStart]);

  const { data: paymentsInMonth, isLoading: loadingPayments } = useQuery({
    queryKey: ["reports-payments", storeId, monthValue],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("amount, order_id")
        .eq("store_id", storeId as string)
        .eq("voided", false)
        .gte("paid_at", monthStart.toISOString())
        .lt("paid_at", monthEndExclusive.toISOString());
      if (error) throw error;
      return data;
    },
  });

  const { data: expensesInMonth, isLoading: loadingExpenses } = useQuery({
    queryKey: ["reports-expenses", storeId, monthValue],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .eq("store_id", storeId as string)
        .gte("spent_at", format(monthStart, "yyyy-MM-dd"))
        .lt("spent_at", format(monthEndExclusive, "yyyy-MM-dd"))
        .order("spent_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: ordersCreated } = useQuery({
    queryKey: ["reports-orders-created", storeId, monthValue],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, client_id, garment_type, price, status, created_at, ready_at, collected_at")
        .eq("store_id", storeId as string)
        .gte("created_at", monthStart.toISOString())
        .lt("created_at", monthEndExclusive.toISOString());
      if (error) throw error;
      return data;
    },
  });

  const { data: ordersCollected } = useQuery({
    queryKey: ["reports-orders-collected", storeId, monthValue],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, assigned_to, created_at, ready_at, collected_at")
        .eq("store_id", storeId as string)
        .gte("collected_at", monthStart.toISOString())
        .lt("collected_at", monthEndExclusive.toISOString());
      if (error) throw error;
      return data;
    },
  });

  const { data: outstandingRows } = useQuery({
    queryKey: ["reports-outstanding", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_balances")
        .select("balance")
        .eq("store_id", storeId as string)
        .gt("balance", 0);
      if (error) throw error;
      return data;
    },
  });

  const { data: trendPayments } = useQuery({
    queryKey: ["reports-trend-payments", storeId, monthValue],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("amount, paid_at")
        .eq("store_id", storeId as string)
        .eq("voided", false)
        .gte("paid_at", trendStart.toISOString())
        .lt("paid_at", monthEndExclusive.toISOString());
      if (error) throw error;
      return data;
    },
  });

  const { data: trendExpenses } = useQuery({
    queryKey: ["reports-trend-expenses", storeId, monthValue],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("amount, spent_at")
        .eq("store_id", storeId as string)
        .gte("spent_at", format(trendStart, "yyyy-MM-dd"))
        .lt("spent_at", format(monthEndExclusive, "yyyy-MM-dd"));
      if (error) throw error;
      return data;
    },
  });

  const paymentOrderIds = useMemo(
    () => [...new Set((paymentsInMonth ?? []).map((p) => p.order_id))],
    [paymentsInMonth],
  );
  const { data: paymentOrders } = useQuery({
    queryKey: ["reports-payment-orders", paymentOrderIds],
    enabled: paymentOrderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, client_id")
        .in("id", paymentOrderIds);
      if (error) throw error;
      return data;
    },
  });

  const relevantClientIds = useMemo(
    () => [
      ...new Set([
        ...(ordersCreated ?? []).map((o) => o.client_id),
        ...(paymentOrders ?? []).map((o) => o.client_id),
      ]),
    ],
    [ordersCreated, paymentOrders],
  );
  const { data: clients } = useQuery({
    queryKey: ["reports-clients", relevantClientIds],
    enabled: relevantClientIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, full_name")
        .in("id", relevantClientIds);
      if (error) throw error;
      return data;
    },
  });
  const clientName = (id: string) => clients?.find((c) => c.id === id)?.full_name ?? "Client";

  const { data: tailorMembers } = useQuery({
    queryKey: ["reports-tailors", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_members")
        .select("*")
        .eq("store_id", storeId as string)
        .eq("role", "tailor")
        .eq("status", "active");
      if (error) throw error;
      return data;
    },
  });
  const tailorUserIds = useMemo(() => (tailorMembers ?? []).map((m) => m.user_id), [tailorMembers]);
  const { data: tailorProfiles } = useQuery({
    queryKey: ["reports-tailor-profiles", tailorUserIds],
    enabled: tailorUserIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", tailorUserIds);
      if (error) throw error;
      return data;
    },
  });
  const tailorName = (id: string) =>
    tailorProfiles?.find((p) => p.id === id)?.full_name ?? "Tailor";

  const collectedRevenue = (paymentsInMonth ?? []).reduce((sum, p) => sum + p.amount, 0);
  const expensesTotal = (expensesInMonth ?? []).reduce((sum, e) => sum + e.amount, 0);
  const netProfit = collectedRevenue - expensesTotal;
  const outstandingBalance = (outstandingRows ?? []).reduce((sum, r) => sum + (r.balance ?? 0), 0);

  const trendMonths = useMemo(() => {
    const months: Date[] = [];
    for (let i = 0; i < 12; i++) months.push(subMonths(monthStart, 11 - i));
    return months;
  }, [monthStart]);

  const trendData = trendMonths.map((m) => {
    const key = format(m, "yyyy-MM");
    const revenue = (trendPayments ?? [])
      .filter((p) => format(new Date(p.paid_at), "yyyy-MM") === key)
      .reduce((sum, p) => sum + p.amount, 0);
    const expenses = (trendExpenses ?? [])
      .filter((e) => format(new Date(e.spent_at), "yyyy-MM") === key)
      .reduce((sum, e) => sum + e.amount, 0);
    return { month: format(m, "MMM"), revenue, expenses };
  });
  const prevMonthRevenue =
    trendData.length > 1 ? (trendData[trendData.length - 2]?.revenue ?? 0) : 0;
  const revenueChange =
    prevMonthRevenue > 0 ? ((collectedRevenue - prevMonthRevenue) / prevMonthRevenue) * 100 : null;

  const expensesByCategory = EXPENSE_CATEGORIES.map((c) => ({
    category: c.label,
    amount: (expensesInMonth ?? [])
      .filter((e) => e.category === c.value)
      .reduce((sum, e) => sum + e.amount, 0),
  })).filter((c) => c.amount > 0);

  const topClients = useMemo(() => {
    const byClient = new Map<string, number>();
    for (const p of paymentsInMonth ?? []) {
      const order = paymentOrders?.find((o) => o.id === p.order_id);
      if (!order) continue;
      byClient.set(order.client_id, (byClient.get(order.client_id) ?? 0) + p.amount);
    }
    return [...byClient.entries()]
      .map(([clientId, amount]) => ({ clientId, amount, name: clientName(clientId) }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentsInMonth, paymentOrders, clients]);

  const topGarments = useMemo(() => {
    const byGarment = new Map<string, { count: number; revenue: number }>();
    for (const o of ordersCreated ?? []) {
      const entry = byGarment.get(o.garment_type) ?? { count: 0, revenue: 0 };
      entry.count += 1;
      entry.revenue += o.price;
      byGarment.set(o.garment_type, entry);
    }
    return [...byGarment.entries()]
      .map(([garment, stats]) => ({ garment, ...stats }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [ordersCreated]);

  const avgToReady = avgDays(
    (ordersCollected ?? [])
      .filter((o) => o.ready_at)
      .map((o) => ({ from: o.created_at, to: o.ready_at as string })),
  );
  const avgToCollected = avgDays(
    (ordersCollected ?? [])
      .filter((o) => o.ready_at)
      .map((o) => ({ from: o.ready_at as string, to: o.collected_at as string })),
  );

  const staffOutput = (tailorMembers ?? []).map((tailor) => ({
    name: tailorName(tailor.user_id),
    completed: (ordersCollected ?? []).filter((o) => o.assigned_to === tailor.user_id).length,
  }));

  function invalidateExpenses() {
    queryClient.invalidateQueries({ queryKey: ["reports-expenses", storeId, monthValue] });
    queryClient.invalidateQueries({ queryKey: ["reports-trend-expenses", storeId, monthValue] });
  }

  function exportCsv() {
    const rows: (string | number)[][] = [
      ["Report month", format(monthStart, "MMMM yyyy")],
      [],
      ["Collected revenue", collectedRevenue],
      ["Expenses", expensesTotal],
      ["Net profit", netProfit],
      ["Outstanding balance", outstandingBalance],
      [],
      ["Top clients by amount paid"],
      ["Client", "Amount"],
      ...topClients.map((c) => [c.name, c.amount]),
      [],
      ["Top garment types"],
      ["Garment", "Count", "Revenue"],
      ...topGarments.map((g) => [g.garment, g.count, g.revenue]),
      [],
      ["Expenses by category"],
      ["Category", "Amount"],
      ...expensesByCategory.map((e) => [e.category, e.amount]),
    ];
    downloadCsv(`jaylor-report-${monthValue}.csv`, rows);
  }

  const isLoading = loadingPayments || loadingExpenses;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-4xl px-4 py-6 lg:px-8 lg:py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl">Reports</h1>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setMonthValue(format(subMonths(monthStart, 1), "yyyy-MM"))}
              aria-label="Previous month"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <input
              type="month"
              value={monthValue}
              onChange={(e) => setMonthValue(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => setMonthValue(format(addMonths(monthStart, 1), "yyyy-MM"))}
              aria-label="Next month"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
        <StitchDivider className="my-6" />

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label="Collected revenue"
              value={formatMoney(collectedRevenue)}
              hint={
                revenueChange !== null
                  ? `${revenueChange >= 0 ? "+" : ""}${revenueChange.toFixed(0)}% vs last month`
                  : undefined
              }
            />
            <Kpi label="Outstanding balance" value={formatMoney(outstandingBalance)} />
            <Kpi label="Expenses" value={formatMoney(expensesTotal)} />
            <Kpi
              label="Net profit"
              value={formatMoney(netProfit)}
              valueClassName={netProfit >= 0 ? "text-paid" : "text-owed"}
            />
          </div>
        )}

        <div className="mt-8 flex items-center justify-between">
          <h2 className="text-xl">Revenue vs expenses</h2>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="size-4" />
            Export CSV
          </Button>
        </div>
        <Card className="mt-3 rounded-2xl">
          <CardContent className="p-4">
            <ChartContainer
              config={{
                revenue: { label: "Revenue", color: "var(--color-gold)" },
                expenses: { label: "Expenses", color: "var(--color-owed)" },
              }}
              className="h-64 w-full"
            >
              <LineChart data={trendData}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={48}
                  tickFormatter={(v: number) => compactMoney(v)}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--color-revenue)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="expenses"
                  stroke="var(--color-expenses)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <div className="mt-8 flex items-center justify-between">
          <h2 className="text-xl">Expenses by category</h2>
          <Button size="sm" onClick={() => setExpenseFormOpen(true)}>
            <Plus className="size-4" />
            Add expense
          </Button>
        </div>
        {expensesByCategory.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No expenses recorded this month.</p>
        ) : (
          <Card className="mt-3 rounded-2xl">
            <CardContent className="p-4">
              <ChartContainer
                config={{ amount: { label: "Amount", color: "var(--color-gold)" } }}
                className="h-56 w-full"
              >
                <BarChart data={expensesByCategory} layout="vertical">
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => compactMoney(v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="category"
                    tickLine={false}
                    axisLine={false}
                    width={120}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="amount" fill="var(--color-amount)" radius={4} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {expensesInMonth && expensesInMonth.length > 0 && (
          <div className="mt-4 space-y-2">
            {expensesInMonth.map((expense) => (
              <div
                key={expense.id}
                className="flex items-center justify-between rounded-xl border border-border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">{categoryLabel(expense.category)}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(expense.spent_at).toLocaleDateString()}
                    {expense.note ? ` · ${expense.note}` : ""}
                  </p>
                </div>
                <span className="figures text-owed">{formatMoney(expense.amount)}</span>
              </div>
            ))}
          </div>
        )}

        <h2 className="mt-8 text-xl">Top clients this month</h2>
        {topClients.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No payments recorded this month.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {topClients.map((c) => (
              <div
                key={c.clientId}
                className="flex items-center justify-between rounded-xl border border-border p-3 text-sm"
              >
                <span>{c.name}</span>
                <span className="figures text-paid">{formatMoney(c.amount)}</span>
              </div>
            ))}
          </div>
        )}

        <h2 className="mt-8 text-xl">Top garment types this month</h2>
        {topGarments.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No orders created this month.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {topGarments.map((g) => (
              <div
                key={g.garment}
                className="flex items-center justify-between rounded-xl border border-border p-3 text-sm"
              >
                <span>
                  {g.garment} <span className="text-muted-foreground">× {g.count}</span>
                </span>
                <span className="figures">{formatMoney(g.revenue)}</span>
              </div>
            ))}
          </div>
        )}

        <h2 className="mt-8 text-xl">Turnaround</h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Kpi label="Avg. days to ready" value={avgToReady != null ? String(avgToReady) : "—"} />
          <Kpi
            label="Avg. days ready to collected"
            value={avgToCollected != null ? String(avgToCollected) : "—"}
          />
        </div>

        {staffOutput.length > 0 && (
          <>
            <h2 className="mt-8 text-xl">Staff output this month</h2>
            <div className="mt-3 space-y-2">
              {staffOutput.map((s) => (
                <div
                  key={s.name}
                  className="flex items-center justify-between rounded-xl border border-border p-3 text-sm"
                >
                  <span>{s.name}</span>
                  <span className="figures">{s.completed} completed</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {storeId && (
        <ExpenseForm
          open={expenseFormOpen}
          onOpenChange={setExpenseFormOpen}
          storeId={storeId}
          onSaved={invalidateExpenses}
        />
      )}
    </AppShell>
  );
}

function Kpi({
  label,
  value,
  hint,
  valueClassName,
}: {
  label: string;
  value: string;
  hint?: string | undefined;
  valueClassName?: string | undefined;
}) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
        <p className={`figures mt-2 text-xl ${valueClassName ?? ""}`}>{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
