import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store-context";

export const DISCOVERY_FEATURES = [
  "ai_design",
  "voice_order",
  "measurement_passport",
  "group_orders",
] as const;

export type DiscoveryFeature = (typeof DISCOVERY_FEATURES)[number];

type DiscoveryState = {
  features_used: string[];
  tour_dismissed_at: string | null;
  tour_completed_at: string | null;
};

const EMPTY_DISCOVERY: DiscoveryState = {
  features_used: [],
  tour_dismissed_at: null,
  tour_completed_at: null,
};

export function useFeatureDiscovery() {
  const { currentStore, currentRole } = useStore();
  const queryClient = useQueryClient();
  const storeId = currentStore?.id;
  const isOwner = currentRole === "owner";

  const query = useQuery({
    queryKey: ["feature-discovery", storeId],
    enabled: !!storeId && (currentRole === "owner" || currentRole === "manager"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_feature_discovery")
        .select("features_used, tour_dismissed_at, tour_completed_at")
        .eq("store_id", storeId as string)
        .maybeSingle();
      if (error) throw error;
      return data ?? EMPTY_DISCOVERY;
    },
  });

  const state = query.data ?? EMPTY_DISCOVERY;
  const firstUnseen = DISCOVERY_FEATURES.find((feature) => !state.features_used.includes(feature));

  const markUsed = useCallback(
    async (feature: DiscoveryFeature) => {
      if (!storeId || !isOwner || state.features_used.includes(feature)) return;
      const features = [...state.features_used, feature];
      const { error } = await supabase
        .from("store_feature_discovery")
        .update({ features_used: features })
        .eq("store_id", storeId);
      if (error) return;
      queryClient.setQueryData<DiscoveryState>(["feature-discovery", storeId], {
        ...state,
        features_used: features,
      });
    },
    [isOwner, queryClient, state, storeId],
  );

  const finishTour = useCallback(
    async (completed: boolean) => {
      if (!storeId || !isOwner) return;
      const now = new Date().toISOString();
      const patch = completed ? { tour_completed_at: now } : { tour_dismissed_at: now };
      const { error } = await supabase
        .from("store_feature_discovery")
        .update(patch)
        .eq("store_id", storeId);
      if (error) return;
      queryClient.setQueryData<DiscoveryState>(["feature-discovery", storeId], {
        ...state,
        ...patch,
      });
    },
    [isOwner, queryClient, state, storeId],
  );

  return {
    ...state,
    isLoading: query.isLoading,
    isOwner,
    firstUnseen,
    isUnseen: (feature: DiscoveryFeature) => isOwner && !state.features_used.includes(feature),
    shouldPulse: (feature: DiscoveryFeature) => isOwner && firstUnseen === feature,
    shouldShowTour:
      isOwner &&
      !query.isLoading &&
      !state.tour_dismissed_at &&
      !state.tour_completed_at,
    markUsed,
    finishTour,
  };
}