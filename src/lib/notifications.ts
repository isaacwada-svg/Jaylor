import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type StoreNotification = {
  id: string;
  type: string;
  message: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

// notifications is a new table (see the migration that added it) that
// generated Supabase types won't know about until types.ts is regenerated
// against the live schema -- same drift as advisor_threads/advisor_messages.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from(table: "notifications"): any };

const NOTIFICATIONS_KEY = (storeId: string | undefined) => ["notifications", storeId];

export function useNotifications(storeId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: NOTIFICATIONS_KEY(storeId),
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await db
        .from("notifications")
        .select("id, type, message, link, read_at, created_at")
        .eq("store_id", storeId as string)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data as StoreNotification[];
    },
  });

  useEffect(() => {
    if (!storeId) return;
    const channel = supabase
      .channel(`notifications:${storeId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `store_id=eq.${storeId}`,
        },
        () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY(storeId) }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [storeId, queryClient]);

  return query;
}

export function useMarkNotificationRead(storeId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id)
        .is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY(storeId) }),
  });
}

export function useMarkAllNotificationsRead(storeId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!storeId) return;
      const { error } = await db
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("store_id", storeId)
        .is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY(storeId) }),
  });
}
