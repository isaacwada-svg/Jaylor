import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";

const RATE_LIMIT_MAX = 30;
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

const sessionSchema = z.object({ sessionToken: z.string().uuid() });

export type PassportMeasurementVersion = {
  id: string;
  version: number;
  taken_at: string;
  unit: string;
  values: Record<string, number>;
  extra_fields: Record<string, number | string>;
  template_id: string | null;
  notes: string | null;
};

export type PassportClientRecord = {
  client_id: string;
  store_id: string;
  store_name: string;
  full_name: string;
  relation: "self" | "guardian";
  versions: PassportMeasurementVersion[];
};

export type PassportTemplate = { id: string; fields: Json };

export type PassportView = {
  records: PassportClientRecord[];
  templates: PassportTemplate[];
};

/** The holder's consolidated view across every shop. Session-gated (never a
 *  direct table read) — see get_passport_view() in the PR J migration. */
export const getPassportView = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => sessionSchema.parse(data))
  .handler(async ({ data }): Promise<PassportView | { error: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!(await withinRateLimit("passport_view", data.sessionToken))) {
      return { error: "Too many requests. Please try again later." };
    }

    const { data: view, error } = await supabaseAdmin.rpc("get_passport_view", {
      p_session_token: data.sessionToken,
    });
    if (error) return { error: error.message };
    return view as unknown as PassportView;
  });

export type PassportShareRow = {
  id: string;
  token: string;
  created_at: string;
  revoked_at: string | null;
  last_accessed_at: string | null;
  used_by_store_name: string | null;
};

export const createPassportShare = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => sessionSchema.parse(data))
  .handler(async ({ data }): Promise<{ token: string } | { error: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!(await withinRateLimit("passport_share_create", data.sessionToken))) {
      return { error: "Too many requests. Please try again later." };
    }

    const { data: share, error } = await supabaseAdmin.rpc("create_passport_share", {
      p_session_token: data.sessionToken,
    });
    if (error || !share) return { error: error?.message ?? "Could not create a share link" };
    return { token: (share as { token: string }).token };
  });

export const listPassportShares = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => sessionSchema.parse(data))
  .handler(async ({ data }): Promise<PassportShareRow[] | { error: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!(await withinRateLimit("passport_share_list", data.sessionToken))) {
      return { error: "Too many requests. Please try again later." };
    }

    const { data: shares, error } = await supabaseAdmin.rpc("list_passport_shares", {
      p_session_token: data.sessionToken,
    });
    if (error) return { error: error.message };
    return (shares ?? []) as unknown as PassportShareRow[];
  });

const revokeSchema = sessionSchema.extend({ shareId: z.string().uuid() });

export const revokePassportShare = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => revokeSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!(await withinRateLimit("passport_share_revoke", data.sessionToken))) {
      return { ok: false, error: "Too many requests. Please try again later." };
    }

    const { error } = await supabaseAdmin.rpc("revoke_passport_share", {
      p_session_token: data.sessionToken,
      p_share_id: data.shareId,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });
