import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const MOMENT_TYPES = [
  "birthday",
  "anniversary",
  "ready",
  "progress",
  "fitcheck",
  "winback",
  "festive",
] as const;
export type MomentType = (typeof MOMENT_TYPES)[number];

export const MOMENT_TYPE_LABELS: Record<MomentType, string> = {
  birthday: "Client birthdays",
  anniversary: "Client anniversaries",
  ready: "Ready for collection",
  progress: "Progress updates",
  fitcheck: "Fit check-ins",
  winback: "Win-back (inactive clients)",
  festive: "Festive greetings",
};

export type Moment = {
  id: string;
  client_id: string;
  order_id: string | null;
  type: MomentType;
  due_date: string;
  status: "pending" | "sent" | "dismissed";
  message: string;
  photo_url: string | null;
  created_at: string;
  sent_at: string | null;
};

export type MomentWithClient = Moment & {
  client_name: string;
  client_phone: string;
};

// moments/moment_settings/client_fit_feedback are new tables that generated
// Supabase types won't know about until types.ts is regenerated -- same
// drift as every other freshly-migrated table this session.
type MomentsTableName = "moments" | "moment_settings" | "client_fit_feedback";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from(table: MomentsTableName): any };

export function usePendingMoments(storeId: string | undefined) {
  return useQuery({
    queryKey: ["moments-pending", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await db
        .from("moments")
        .select(
          "id, client_id, order_id, type, due_date, status, message, photo_url, created_at, sent_at, clients(full_name, whatsapp_phone, phone)",
        )
        .eq("store_id", storeId as string)
        .eq("status", "pending")
        .lte("due_date", new Date().toISOString().slice(0, 10))
        .order("due_date", { ascending: true });
      if (error) throw error;
      type RawRow = Moment & {
        clients: { full_name: string; whatsapp_phone: string | null; phone: string } | null;
      };
      return (data ?? []).map((row: RawRow) => ({
        ...row,
        client_name: row.clients?.full_name ?? "",
        client_phone: row.clients?.whatsapp_phone ?? row.clients?.phone ?? "",
      })) as MomentWithClient[];
    },
  });
}

export function useClientMoments(clientId: string | undefined) {
  return useQuery({
    queryKey: ["moments-client", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await db
        .from("moments")
        .select("id, type, due_date, status, message, created_at, sent_at")
        .eq("client_id", clientId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Moment[];
    },
  });
}

export function useMarkMoment(storeId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
      message,
    }: {
      id: string;
      status: "sent" | "dismissed";
      message?: string;
    }) => {
      const patch: Record<string, unknown> = { status };
      if (status === "sent") patch["sent_at"] = new Date().toISOString();
      if (message !== undefined) patch["message"] = message;
      const { error } = await db.from("moments").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["moments-pending", storeId] });
      queryClient.invalidateQueries({ queryKey: ["moments-client"] });
    },
  });
}

export function useMomentSettings(storeId: string | undefined) {
  return useQuery({
    queryKey: ["moment-settings", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await db
        .from("moment_settings")
        .select("type, enabled")
        .eq("store_id", storeId as string);
      if (error) throw error;
      return data as { type: MomentType; enabled: boolean }[];
    },
  });
}

export function useSetMomentSetting(storeId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ type, enabled }: { type: MomentType; enabled: boolean }) => {
      const { error } = await db
        .from("moment_settings")
        .update({ enabled })
        .eq("store_id", storeId as string)
        .eq("type", type);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["moment-settings", storeId] }),
  });
}
