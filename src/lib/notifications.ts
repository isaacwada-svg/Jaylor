import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
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

// AppShell renders NotificationBell twice (desktop + mobile header, both
// mounted at once, one just CSS-hidden), so two useNotifications(storeId)
// instances share the same storeId and would otherwise both try to
// `.channel(topic).on(...).subscribe()` the same topic -- supabase-js
// returns the SAME channel object for a repeated topic, and calling `.on()`
// on a channel that's already `.subscribe()`d throws. Ref-count instead: only
// the first mount actually subscribes, later mounts just piggyback on it
// (their invalidateQueries call is redundant but harmless), and the channel
// is only removed once every mount has unmounted.
const notificationChannels = new Map<string, { channel: RealtimeChannel; refCount: number }>();

function subscribeToStoreNotifications(storeId: string, onInsert: () => void) {
  const topic = `notifications:${storeId}`;
  const existing = notificationChannels.get(topic);
  if (existing) {
    existing.refCount += 1;
  } else {
    const channel = supabase
      .channel(topic)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `store_id=eq.${storeId}`,
        },
        onInsert,
      )
      .subscribe();
    notificationChannels.set(topic, { channel, refCount: 1 });
  }
  return () => {
    const entry = notificationChannels.get(topic);
    if (!entry) return;
    entry.refCount -= 1;
    if (entry.refCount <= 0) {
      void supabase.removeChannel(entry.channel);
      notificationChannels.delete(topic);
    }
  };
}

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
    return subscribeToStoreNotifications(storeId, () =>
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY(storeId) }),
    );
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
