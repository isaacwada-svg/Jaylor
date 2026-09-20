import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type FeatureUsage = {
  allowed: boolean;
  limit: number | boolean | null;
  used: number;
  plan: string;
  required_plan: string | null;
};

/** Reads plan limits + this month's usage for a feature key (e.g. "orders"). */
export function useFeature(storeId: string | undefined, feature: string) {
  return useQuery({
    queryKey: ["feature-usage", storeId, feature],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("feature_usage", {
        p_store_id: storeId as string,
        p_feature: feature,
      });
      if (error) throw error;
      return data as unknown as FeatureUsage;
    },
  });
}
