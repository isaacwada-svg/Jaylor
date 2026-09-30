import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOnlineStatus } from "@/lib/use-online-status";

export type CapacityWeek = {
  week_start: string;
  garments_due: number;
  capacity: number | null;
  overloaded: boolean;
};

export type CapacityForecast = {
  capacity: number | null;
  capacity_source: "measured" | "estimate" | "none";
  weeks_of_data: number;
  weeks: CapacityWeek[];
};

/** Dashboard's forward-looking load chart. Offline-safe: the query simply
 *  doesn't run, and the caller shows "Capacity check unavailable offline". */
export function useCapacityForecast(storeId: string | undefined, weeks = 6) {
  const online = useOnlineStatus();
  return useQuery({
    queryKey: ["store-capacity-forecast", storeId, weeks],
    enabled: !!storeId && online,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_store_capacity_forecast", {
        p_store_id: storeId as string,
        p_weeks: weeks,
      });
      if (error) throw error;
      return data as unknown as CapacityForecast;
    },
  });
}

export type OrderCapacityCheck = {
  week_start: string;
  garments_due: number;
  capacity: number | null;
  capacity_source: "measured" | "estimate" | "none";
  overloaded: boolean;
  suggested_week: string | null;
};

/** Order form/edit: that week's load for a chosen delivery date. Never
 *  blocks the save -- the caller only shows a non-blocking warning. */
export function useOrderCapacityCheck(storeId: string | undefined, date: string | null) {
  const online = useOnlineStatus();
  return useQuery({
    queryKey: ["order-capacity-check", storeId, date],
    enabled: !!storeId && !!date && online,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_order_capacity_check", {
        p_store_id: storeId as string,
        p_date: date as string,
      });
      if (error) throw error;
      return data as unknown as OrderCapacityCheck;
    },
  });
}
