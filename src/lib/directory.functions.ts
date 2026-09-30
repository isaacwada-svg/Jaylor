import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { DirectoryPage, DirectoryLocation } from "@/lib/directory";

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MINUTES = 60;

async function withinRateLimit(bucket: string, key: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.rpc("check_rate_limit", {
    p_bucket: bucket,
    p_key: key,
    p_max_count: RATE_LIMIT_MAX,
    p_window_minutes: RATE_LIMIT_WINDOW_MINUTES,
  });
  return data !== false;
}

const listingsSchema = z.object({
  search: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  specialty: z.string().max(100).optional(),
  page: z.number().int().min(1).max(500).optional(),
});

/** Public, paginated directory results -- called from a route loader so the
 *  default page is server-rendered for search engines. */
export const getDirectoryListings = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => listingsSchema.parse(data))
  .handler(async ({ data }): Promise<DirectoryPage> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: page, error } = await supabaseAdmin.rpc("get_directory_listings", {
      ...(data.search?.trim() ? { p_search: data.search.trim() } : {}),
      ...(data.state ? { p_state: data.state } : {}),
      ...(data.city ? { p_city: data.city } : {}),
      ...(data.specialty ? { p_specialty: data.specialty } : {}),
      p_page: data.page ?? 1,
    });
    if (error) throw new Error("Could not load the directory");
    return page as unknown as DirectoryPage;
  });

export const getDirectoryLocations = createServerFn({ method: "GET" }).handler(
  async (): Promise<DirectoryLocation[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("get_directory_locations");
    if (error) throw new Error("Could not load the directory");
    return (data ?? []) as unknown as DirectoryLocation[];
  },
);

export const getDirectorySpecialties = createServerFn({ method: "GET" }).handler(
  async (): Promise<string[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("get_directory_specialties");
    if (error) throw new Error("Could not load the directory");
    return (data ?? []) as unknown as string[];
  },
);

const reportSchema = z.object({
  storeId: z.string().uuid(),
  reason: z.string().min(1).max(200),
  details: z.string().max(1000).optional(),
  reporterContact: z.string().max(200).optional(),
});

/** Rate-limited per store (not per reporter -- there's no reporter identity
 *  here), so one listing can't be report-bombed, without needing an IP. */
export const reportDirectoryListing = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => reportSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    if (!(await withinRateLimit("directory_report", data.storeId))) {
      return { ok: false, error: "Too many reports for this listing. Please try again later." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("create_directory_report", {
      p_store_id: data.storeId,
      p_reason: data.reason,
      ...(data.details?.trim() ? { p_details: data.details.trim() } : {}),
      ...(data.reporterContact?.trim() ? { p_reporter_contact: data.reporterContact.trim() } : {}),
    });
    if (error) return { ok: false, error: "Could not send this report" };
    return { ok: true };
  });
