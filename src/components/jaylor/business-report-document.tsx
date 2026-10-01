import { format, parse } from "date-fns";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { BrandLogo } from "@/components/jaylor/logo";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { Card, CardContent } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { formatMoney } from "@/lib/jaylor";

export type HealthReport = {
  store_name: string;
  store_logo_url: string | null;
  store_city: string | null;
  period_month: string;
  is_current_month: boolean;
  months_on_jaylor: number;
  has_data: boolean;
  money: {
    billed: number;
    collected: number;
    outstanding: number;
    collection_rate: number | null;
    avg_order_value: number;
  };
  profit: {
    order_profit: number;
    margin: number | null;
    expenses: number;
    net_profit: number;
  };
  work: {
    orders_created: number;
    garments_created: number;
    orders_completed: number;
    on_time_rate: number | null;
    garments_by_type: { garment_type: string; count: number; revenue: number }[];
  };
  clients: {
    active_clients: number;
    repeat_rate: number | null;
    top_clients: { name: string; amount: number }[];
  };
  trend: { month: string; billed: number; collected: number }[];
};

function compactMoney(n: number) {
  return new Intl.NumberFormat("en-NG", { notation: "compact", maximumFractionDigits: 1 }).format(
    n,
  );
}

export function periodLabel(report: HealthReport) {
  const date = parse(report.period_month, "yyyy-MM", new Date());
  const label = format(date, "MMMM yyyy");
  return report.is_current_month ? `${label} (month to date)` : label;
}

/**
 * The business health report document -- shared by the owner/manager's
 * authenticated view (business-report.tsx) and the public /r/$token page,
 * so both always render the exact same shape. "Download PDF" is the
 * browser's own print-to-PDF (the @media print block below), the same
 * print -> Save as PDF pattern already used for quotes
 * (quote-document.tsx) and receipts (receipt-dialog.tsx) -- no new
 * dependency, and it already looks right on A4 in this app. A fixed
 * max-width and compact spacing keep this to two pages.
 */
export function BusinessReportDocument({ report, id }: { report: HealthReport; id: string }) {
  return (
    <div
      id={id}
      className="mx-auto w-full max-w-4xl px-4 pb-10 lg:px-8 print:max-w-none print:px-0"
    >
      <Card className="rounded-2xl print:rounded-none print:border-none print:shadow-none">
        <CardContent className="p-6 print:p-0">
          <div className="flex items-start justify-between gap-4 border-b-2 border-gold pb-4">
            <div className="flex items-center gap-3">
              {report.store_logo_url ? (
                <img
                  src={report.store_logo_url}
                  alt=""
                  className="size-10 rounded-full object-cover"
                />
              ) : (
                <BrandLogo markClassName="h-8 w-auto" />
              )}
              <div>
                <p className="font-heading text-xl">{report.store_name}</p>
                <p className="text-xs text-muted-foreground">
                  {report.store_city ? `${report.store_city} · ` : ""}
                  {report.months_on_jaylor} month{report.months_on_jaylor === 1 ? "" : "s"} on
                  Jaylor
                </p>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                Business report
              </p>
              <p className="font-medium">{periodLabel(report)}</p>
            </div>
          </div>

          {!report.has_data && (
            <p className="mt-4 rounded-lg bg-accent/40 px-3 py-2 text-sm text-muted-foreground">
              No orders, payments or expenses recorded this month yet.
            </p>
          )}

          <h3 className="mt-6 text-sm font-medium uppercase tracking-[0.1em] text-muted-foreground">
            Money
          </h3>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <ReportStat label="Billed" value={formatMoney(report.money.billed)} />
            <ReportStat label="Collected" value={formatMoney(report.money.collected)} />
            <ReportStat label="Outstanding" value={formatMoney(report.money.outstanding)} />
            <ReportStat
              label="Collection rate"
              value={
                report.money.collection_rate != null ? `${report.money.collection_rate}%` : "—"
              }
            />
            <ReportStat
              label="Avg. order value"
              value={formatMoney(report.money.avg_order_value)}
            />
          </div>

          <h3 className="mt-6 text-sm font-medium uppercase tracking-[0.1em] text-muted-foreground">
            Profit
          </h3>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ReportStat label="Order profit" value={formatMoney(report.profit.order_profit)} />
            <ReportStat
              label="Margin"
              value={report.profit.margin != null ? `${report.profit.margin}%` : "—"}
            />
            <ReportStat label="Expenses" value={formatMoney(report.profit.expenses)} />
            <ReportStat label="Net profit" value={formatMoney(report.profit.net_profit)} />
          </div>

          <h3 className="mt-6 text-sm font-medium uppercase tracking-[0.1em] text-muted-foreground">
            Work
          </h3>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ReportStat label="Orders created" value={String(report.work.orders_created)} />
            <ReportStat label="Garments created" value={String(report.work.garments_created)} />
            <ReportStat label="Orders completed" value={String(report.work.orders_completed)} />
            <ReportStat
              label="On-time rate"
              value={
                report.work.on_time_rate != null
                  ? `${report.work.on_time_rate}%`
                  : "Not enough completed orders yet"
              }
            />
          </div>
          {report.work.garments_by_type.length > 0 && (
            <div className="mt-3 space-y-1">
              {report.work.garments_by_type.slice(0, 6).map((g) => (
                <div key={g.garment_type} className="flex items-center justify-between text-sm">
                  <span>
                    {g.garment_type} <span className="text-muted-foreground">× {g.count}</span>
                  </span>
                  <span className="figures">{formatMoney(g.revenue)}</span>
                </div>
              ))}
            </div>
          )}

          <h3 className="mt-6 text-sm font-medium uppercase tracking-[0.1em] text-muted-foreground">
            Clients
          </h3>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <ReportStat label="Active clients" value={String(report.clients.active_clients)} />
            <ReportStat
              label="Repeat client rate"
              value={report.clients.repeat_rate != null ? `${report.clients.repeat_rate}%` : "—"}
            />
          </div>
          {report.clients.top_clients.length > 0 && (
            <div className="mt-3 space-y-1">
              <p className="text-xs text-muted-foreground">Top clients by amount billed</p>
              {report.clients.top_clients.map((c, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span>{c.name}</span>
                  <span className="figures">{formatMoney(c.amount)}</span>
                </div>
              ))}
            </div>
          )}

          <h3 className="mt-6 text-sm font-medium uppercase tracking-[0.1em] text-muted-foreground print:hidden">
            6-month trend
          </h3>
          <div className="mt-2 print:hidden">
            <ChartContainer
              config={{
                billed: { label: "Billed", color: "var(--color-gold)" },
                collected: { label: "Collected", color: "var(--color-paid)" },
              }}
              className="h-56 w-full"
            >
              <BarChart data={report.trend}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={48}
                  tickFormatter={(v: number) => compactMoney(v)}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="billed" fill="var(--color-billed)" radius={4} />
                <Bar dataKey="collected" fill="var(--color-collected)" radius={4} />
              </BarChart>
            </ChartContainer>
          </div>

          <StitchDivider className="my-6" />
          <p className="text-center text-[10px] text-muted-foreground">
            Figures generated from records kept in Jaylor. Not audited.
            <br />
            Generated {new Date().toLocaleString()}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function ReportStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
      <p className="figures mt-0.5 text-lg">{value}</p>
    </div>
  );
}
