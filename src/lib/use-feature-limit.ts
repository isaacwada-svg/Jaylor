import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { FeatureUsage } from "@/lib/use-feature";

/**
 * Reads plan limits + this month's usage for one of the newer, generic
 * feature keys (voice_entry, chat_import, storefront_items, users, etc.)
 * via `check_feature_limit`, kept separate from `useFeature`/`feature_usage`
 * so the original orders/whatsapp_auto gates are never touched.
 */
export function useFeatureLimit(storeId: string | undefined, feature: string, quantity = 1) {
  return useQuery({
    queryKey: ["feature-limit", storeId, feature, quantity],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("check_feature_limit", {
        p_store_id: storeId as string,
        p_feature: feature,
        p_quantity: quantity,
      });
      if (error) throw error;
      return data as unknown as FeatureUsage;
    },
  });
}
