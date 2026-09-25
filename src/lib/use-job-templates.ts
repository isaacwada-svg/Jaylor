import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { JobTemplate } from "@/lib/job-templates";

type JobTemplateRow = Tables<"job_templates">;

export type JobTemplateWithMeta = JobTemplate & { id: string; hidden: boolean };

function rowToJobTemplate(row: JobTemplateRow): JobTemplateWithMeta {
  return {
    id: row.id,
    jobType: row.job_type as JobTemplate["jobType"],
    label: row.label,
    description: row.description,
    namePlaceholder: row.name_placeholder,
    payerMode: row.payer_mode as JobTemplate["payerMode"],
    collectionMode: row.collection_mode as JobTemplate["collectionMode"],
    pricingMode: row.pricing_mode as JobTemplate["pricingMode"],
    turnaroundMode: row.turnaround_mode as JobTemplate["turnaroundMode"],
    guestWelcomeLine: row.guest_welcome_line,
    isContract: row.is_contract,
    hidden: row.hidden,
  };
}

/**
 * A store's own job-type templates: the built-in set (seeded on store
 * creation, hideable but not deletable) plus any custom ones the owner or
 * a manager added. Returns every row (including hidden ones) so lookups
 * for already-created jobs still resolve; filter `.hidden` out yourself
 * for a creation picker.
 */
export function useJobTemplates(storeId: string | undefined) {
  return useQuery({
    queryKey: ["job-templates", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_templates")
        .select("*")
        .eq("store_id", storeId as string)
        .order("is_default", { ascending: false })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data.map(rowToJobTemplate);
    },
  });
}
