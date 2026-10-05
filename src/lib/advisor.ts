import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAiCredits } from "@/lib/ai-credits";

export type AdvisorThread = { id: string; title: string; updated_at: string };
export type AdvisorMessage = { id: string; role: "user" | "assistant"; content: string };

// advisor_threads/advisor_messages are new tables (see the migration that
// added them) that generated Supabase types won't know about until the
// project's types.ts is regenerated against the live schema -- same drift
// as every other freshly-migrated table this session. Narrowly cast to
// `any` at the query boundary rather than losing typing across this file.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from(table: "advisor_threads" | "advisor_messages"): any };

export function useAdvisorThreads(storeId: string | undefined) {
  return useQuery({
    queryKey: ["advisor-threads", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await db
        .from("advisor_threads")
        .select("id, title, updated_at")
        .eq("store_id", storeId as string)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as AdvisorThread[];
    },
  });
}

export function useAdvisorMessages(threadId: string | null) {
  return useQuery({
    queryKey: ["advisor-messages", threadId],
    enabled: !!threadId,
    queryFn: async () => {
      const { data, error } = await db
        .from("advisor_messages")
        .select("id, role, content")
        .eq("thread_id", threadId as string)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as AdvisorMessage[];
    },
  });
}

/**
 * AI-credit-gated like every other AI feature: `run()` already shows the
 * right toast or opens the top-up/upgrade sheet on failure, so a rejected
 * mutation here means that UX already happened -- the caller just needs to
 * restore the typed message, not show its own error.
 */
export function useSendAdvisorMessage(storeId: string | undefined) {
  const queryClient = useQueryClient();
  const { run } = useAiCredits();
  return useMutation({
    mutationFn: async ({ threadId, message }: { threadId: string | null; message: string }) => {
      const res = await run("advisor_chat", { threadId, message });
      if (!res.ok) throw new Error("handled");
      return res.result as { threadId: string; reply: string };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["advisor-threads", storeId] });
      queryClient.invalidateQueries({ queryKey: ["advisor-messages", variables.threadId] });
    },
  });
}

export function useDeleteAdvisorThread(storeId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (threadId: string) => {
      const { error } = await db.from("advisor_threads").delete().eq("id", threadId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["advisor-threads", storeId] });
    },
  });
}
