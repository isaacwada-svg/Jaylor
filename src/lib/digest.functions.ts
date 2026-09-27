import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendDailyDigest, sendWeeklyDigest, sendTransferAlert } from "@/lib/digest.server";
import type { Database } from "@/integrations/supabase/types";

async function requireOwnerOrManager(
  supabase: SupabaseClient<Database>,
  storeId: string,
  userId: string,
) {
  const { data: membership } = await supabase
    .from("store_members")
    .select("role, status")
    .eq("store_id", storeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (
    !membership ||
    membership.status !== "active" ||
    !["owner", "manager"].includes(membership.role)
  ) {
    throw new Error("You don't have permission to do this");
  }
}

/** Admin-only "send test digest now" button -- ignores the store's own toggle. */
export const sendTestDigest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ storeId: z.string().uuid(), kind: z.enum(["daily", "weekly"]) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await requireOwnerOrManager(context.supabase, data.storeId, context.userId);
    const result =
      data.kind === "daily"
        ? await sendDailyDigest(data.storeId, { force: true })
        : await sendWeeklyDigest(data.storeId, { force: true });
    return result;
  });

/** Fired right after a successful manual assign_incoming_transfer(), from the Unmatched
 *  payments screen -- the auto-match path gets the same alert via the webhook's HTTP relay
 *  to /api/internal/transfer-alert instead, since it runs from a Deno edge function. */
export const notifyTransferAssigned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        storeId: z.string().uuid(),
        orderId: z.string().uuid(),
        transferId: z.string().uuid(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await requireOwnerOrManager(context.supabase, data.storeId, context.userId);
    return sendTransferAlert(data.storeId, data.orderId, data.transferId);
  });
