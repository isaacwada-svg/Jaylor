import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Extra automatic-message allowance bought this calendar month, on top of the plan's included amount. */
export function useMessageTopups(storeId: string | undefined) {
  return useQuery({
    queryKey: ["message-topups", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from("message_topups")
        .select("quantity")
        .eq("store_id", storeId as string)
        .eq("status", "success")
        .gte("created_at", startOfMonth.toISOString());
      if (error) throw error;
      return data.reduce((sum, row) => sum + row.quantity, 0);
    },
  });
}
