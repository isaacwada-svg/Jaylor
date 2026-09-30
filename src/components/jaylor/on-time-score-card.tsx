import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";

type OnTimeScore = {
  rate: number | null;
  orders_counted: number;
  has_enough_data: boolean;
};

/** Growth+ dashboard card. Hidden entirely until 10 orders have reached
 *  "ready" in the last 90 days -- see get_store_on_time_score(). */
export function OnTimeScoreCard({ storeId }: { storeId: string }) {
  const { data } = useQuery({
    queryKey: ["store-on-time-score", storeId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_store_on_time_score", {
        p_store_id: storeId,
      });
      if (error) throw error;
      return data as unknown as OnTimeScore;
    },
  });

  if (!data || !data.has_enough_data) return null;

  return (
    <Card className="rounded-2xl">
      <CardContent className="p-5">
        <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
          On-time delivery
        </p>
        <p className="mt-1 text-3xl figures">{data.rate}%</p>
        <p className="mt-1 text-sm text-muted-foreground">
          of the last {data.orders_counted} orders, over the last 90 days
        </p>
      </CardContent>
    </Card>
  );
}
