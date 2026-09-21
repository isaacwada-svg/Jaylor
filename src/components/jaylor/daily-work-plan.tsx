import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { orderStatusLabel } from "@/lib/jaylor";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Daily work plan, rule-based (no AI): orders sorted by due date, current
 * status, and whether they've sat in their current status longer than this
 * shop's own historical average for that status (from order_status_history) —
 * the "learned average stage time" the plan is ordered by.
 */

const ACTIVE_STATUSES = ["received", "cutting", "sewing", "fitting", "adjustments"];
const STUCK_MULTIPLIER = 1.3;

type WorkOrder = {
  id: string;
  number: string;
  garment_type: string;
  status: string;
  delivery_date: string | null;
  updated_at: string;
  stuck: boolean;
};

export function DailyWorkPlan({ storeId }: { storeId: string | undefined }) {
  const { data: plan, isLoading } = useQuery({
    queryKey: ["daily-work-plan", storeId],
    enabled: !!storeId,
    queryFn: async () => buildPlan(storeId as string),
  });

  if (isLoading || !plan || plan.length === 0) return null;

  return (
    <Card className="rounded-2xl border-gold/30">
      <CardContent className="p-5">
        <p className="font-medium">Today&apos;s plan</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Sorted by due date and how long each order has sat at its stage.
        </p>
        <div className="mt-4 space-y-2">
          {plan.map((o) => (
            <Link
              key={o.id}
              to="/orders/$orderId"
              params={{ orderId: o.id }}
              className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-accent/40"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {o.number} · {o.garment_type}
                </p>
                <p className="text-xs text-muted-foreground">
                  {o.delivery_date
                    ? `Due ${new Date(o.delivery_date).toLocaleDateString()}`
                    : "No due date"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {o.stuck && (
                  <Badge variant="outline" className="border-owed/40 text-owed">
                    Taking longer than usual
                  </Badge>
                )}
                <Badge variant="outline">{orderStatusLabel(o.status)}</Badge>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

async function buildPlan(storeId: string): Promise<WorkOrder[]> {
  const { data: recentOrders, error } = await supabase
    .from("orders")
    .select("id, number, garment_type, status, delivery_date, updated_at")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;

  const active = (recentOrders ?? []).filter((o) => ACTIVE_STATUSES.includes(o.status));
  if (active.length === 0) return [];

  const orderIds = (recentOrders ?? []).map((o) => o.id);
  const { data: history } = await supabase
    .from("order_status_history")
    .select("order_id, to_status, changed_at")
    .in("order_id", orderIds)
    .order("changed_at", { ascending: true });

  const byOrder: Record<string, { to_status: string; changed_at: string }[]> = {};
  for (const h of history ?? []) {
    (byOrder[h.order_id] ??= []).push(h);
  }

  const durationsByStatus: Record<string, number[]> = {};
  for (const rows of Object.values(byOrder)) {
    for (let i = 1; i < rows.length; i++) {
      const from = rows[i - 1]?.to_status;
      const prevAt = rows[i - 1]?.changed_at;
      const nextAt = rows[i]?.changed_at;
      if (!from || !prevAt || !nextAt) continue;
      const durationMs = new Date(nextAt).getTime() - new Date(prevAt).getTime();
      if (durationMs > 0) (durationsByStatus[from] ??= []).push(durationMs);
    }
  }
  const avgDurationMs: Record<string, number> = {};
  for (const [status, durs] of Object.entries(durationsByStatus)) {
    avgDurationMs[status] = durs.reduce((a, b) => a + b, 0) / durs.length;
  }

  const now = Date.now();
  const withUrgency = active.map((o) => {
    const timeInStatusMs = now - new Date(o.updated_at).getTime();
    const avg = avgDurationMs[o.status];
    const stuck = avg != null && timeInStatusMs > avg * STUCK_MULTIPLIER;
    return { ...o, stuck };
  });

  const statusRank = (s: string) => Math.max(0, ACTIVE_STATUSES.indexOf(s));
  withUrgency.sort((a, b) => {
    const aDue = a.delivery_date ? new Date(a.delivery_date).getTime() : Infinity;
    const bDue = b.delivery_date ? new Date(b.delivery_date).getTime() : Infinity;
    if (aDue !== bDue) return aDue - bDue;
    if (a.stuck !== b.stuck) return a.stuck ? -1 : 1;
    return statusRank(a.status) - statusRank(b.status);
  });

  return withUrgency.slice(0, 12);
}
