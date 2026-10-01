import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// has_health_report_access isn't in the generated Database types yet.
// Must stay a call on `supabase` itself, not a bare extracted reference --
// supabase.rpc() reads `this.rest` internally, so aliasing it directly
// loses that binding and throws "Cannot read properties of undefined
// (reading 'rest')".
function rpcHealthReportAccess(storeId: string): Promise<{ data: unknown; error: unknown }> {
  return supabase.rpc(
    "has_health_report_access" as never,
    { p_store_id: storeId } as never,
  ) as unknown as Promise<{
    data: unknown;
    error: unknown;
  }>;
}

/**
 * Business and Custom plans, plus any store still on its trial -- not the
 * same check as useFeature(storeId, "health_report"), which would read
 * growth's own flag (false) and incorrectly block a trialing store, since
 * a trial is plan_code "growth" with trial_ends_at in the future. See the
 * has_health_report_access() migration comment for the full reasoning.
 */
export function useHealthReportAccess(storeId: string | undefined) {
  return useQuery({
    queryKey: ["health-report-access", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await rpcHealthReportAccess(storeId as string);
      if (error) throw error;
      return data as boolean;
    },
  });
}
