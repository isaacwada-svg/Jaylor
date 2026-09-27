import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney } from "@/lib/jaylor";
import { Card, CardContent } from "@/components/ui/card";

type OrderRef = { order_id: string; number: string; client_name: string };
type DailyDigest = {
  due_today: OrderRef[];
  due_next_3_days: OrderRef[];
  overdue: OrderRef[];
  outstanding_total: number;
  top_balances: { client_name: string; balance: number; number: string }[];
};

/** Same content as the daily digest email/WhatsApp send -- see get_daily_digest_data(). */
export function TodayCard({ storeId }: { storeId: string | undefined }) {
  const { data, isLoading } = useQuery({
    queryKey: ["today-card", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_daily_digest_data", {
        p_store_id: storeId as string,
      });
      if (error) throw error;
      return data as unknown as DailyDigest;
    },
  });

  if (isLoading || !data) return null;

  return (
    <Card className="rounded-2xl">
      <CardContent className="space-y-2 p-5">
        <p className="font-medium">Today</p>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Due today</span>
          <span>{data.due_today.length}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Due in 3 days</span>
          <span>{data.due_next_3_days.length}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Overdue</span>
          <span className={data.overdue.length > 0 ? "text-owed" : undefined}>
            {data.overdue.length}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Outstanding</span>
          <span className="figures">{formatMoney(data.outstanding_total)}</span>
        </div>
        {data.top_balances.length > 0 && (
          <div className="border-t border-border pt-2 text-sm">
            <p className="text-xs text-muted-foreground">Top balances to chase</p>
            {data.top_balances.map((b) => (
              <div key={b.number} className="mt-1 flex items-center justify-between">
                <span>{b.client_name}</span>
                <span className="figures">{formatMoney(b.balance)}</span>
              </div>
            ))}
          </div>
        )}
        <Link
          to="/orders"
          className="block pt-1 text-xs text-muted-foreground hover:text-foreground"
        >
          View orders →
        </Link>
      </CardContent>
    </Card>
  );
}
