import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store-context";

/** Which optional sidebar items a store has pinned — synced to the account
 *  via Supabase, so it follows the store across devices (same pattern as
 *  useFeatureDiscovery). */
export function usePinnedNav() {
  const { currentStore } = useStore();
  const queryClient = useQueryClient();
  const storeId = currentStore?.id;

  const query = useQuery({
    queryKey: ["nav-pins", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_nav_pins")
        .select("pinned_keys")
        .eq("store_id", storeId as string)
        .maybeSingle();
      if (error) throw error;
      return data?.pinned_keys ?? [];
    },
  });

  const pinned = query.data ?? [];

  const toggle = useCallback(
    async (key: string) => {
      if (!storeId) return;
      const next = pinned.includes(key) ? pinned.filter((k) => k !== key) : [...pinned, key];
      queryClient.setQueryData<string[]>(["nav-pins", storeId], next);
      const { error } = await supabase
        .from("store_nav_pins")
        .upsert({ store_id: storeId, pinned_keys: next }, { onConflict: "store_id" });
      if (error) {
        queryClient.setQueryData<string[]>(["nav-pins", storeId], pinned);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["nav-pins", storeId] });
    },
    [pinned, queryClient, storeId],
  );

  return {
    pinned,
    isPinned: (key: string) => pinned.includes(key),
    toggle,
  };
}
