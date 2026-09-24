import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const MILESTONE_KEYS = [
  "orders_50",
  "orders_100",
  "collected_1m",
  "zero_balance_day",
] as const;
export type MilestoneKey = (typeof MILESTONE_KEYS)[number];

export type StoreMilestone = {
  id: string;
  milestone_key: MilestoneKey;
  achieved_at: string;
  detail: Record<string, unknown> | null;
  acknowledged: boolean;
};

// store_milestones is a new table generated Supabase types won't know
// about until types.ts is regenerated against the live schema -- same
// drift as every other freshly-migrated table this session.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from(table: "store_milestones"): any };

export function useUnacknowledgedMilestones(storeId: string | undefined) {
  return useQuery({
    queryKey: ["store-milestones", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await db
        .from("store_milestones")
        .select("id, milestone_key, achieved_at, detail, acknowledged")
        .eq("store_id", storeId as string)
        .eq("acknowledged", false)
        .order("achieved_at", { ascending: true });
      if (error) throw error;
      return data as StoreMilestone[];
    },
  });
}

export function useAcknowledgeMilestone(storeId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db
        .from("store_milestones")
        .update({ acknowledged: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["store-milestones", storeId] }),
  });
}
