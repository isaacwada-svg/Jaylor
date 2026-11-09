import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// has_job_board_access isn't in the generated Database types yet. Must stay
// a call on `supabase` itself, not a bare extracted reference -- see
// use-health-report-access.ts for why.
function rpcJobBoardAccess(storeId: string): Promise<{ data: unknown; error: unknown }> {
  return supabase.rpc(
    "has_job_board_access" as never,
    { p_store_id: storeId } as never,
  ) as unknown as Promise<{
    data: unknown;
    error: unknown;
  }>;
}

/**
 * Business and Custom plans, plus any store still on its trial -- same
 * trial-inclusive pattern as useHealthReportAccess, not plain
 * useFeature(storeId, "job_board"), which would read growth's own flag
 * (false) and incorrectly block a trialing store.
 */
export function useJobBoardAccess(storeId: string | undefined) {
  return useQuery({
    queryKey: ["job-board-access", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await rpcJobBoardAccess(storeId as string);
      if (error) throw error;
      return data as boolean;
    },
  });
}
