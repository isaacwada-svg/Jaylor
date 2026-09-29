import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runAiFeature, type AiRunResponse } from "./ai-run.server";

const PAYSTACK_BASE = "https://api.paystack.co";
const ALLOWED_CALLBACK_HOSTS = [
  "jaylor.com.ng",
  "www.jaylor.com.ng",
  "jaylor.lovable.app",
  "id-preview--05f85e9b-2961-4b8c-a64d-f5000e332728.lovable.app",
  "project--05f85e9b-2961-4b8c-a64d-f5000e332728-dev.lovable.app",
  "localhost",
];

function paystackKey(): string {
  const key = process.env["PAYSTACK_SECRET_KEY"];
  if (!key) throw new Error("Payments aren't set up yet. Please try again shortly.");
  return key;
}

/** The one server entry for every credit-based AI feature. */
export const aiRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        storeId: z.string().uuid(),
        feature: z.string().min(1).max(64),
        input: z.record(z.string(), z.unknown()).default({}),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<AiRunResponse> => {
    return runAiFeature({
      userId: context.userId,
      storeId: data.storeId,
      feature: data.feature,
      input: data.input as Record<string, unknown>,
    });
  });

export const startAiTopup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ storeId: z.string().uuid(), packId: z.string().min(1).max(40), callbackUrl: z.string().url().max(500) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const host = new URL(data.callbackUrl).hostname;
    if (!ALLOWED_CALLBACK_HOSTS.includes(host)) throw new Error("Invalid return address");
    const { data: member } = await context.supabase
      .from("store_members")
      .select("role, status")
      .eq("store_id", data.storeId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!member || member.status !== "active") throw new Error("You don't have access to this shop");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any; // new tables not yet in generated types
    const { data: pack } = await db
      .from("ai_credit_packs")
      .select("id, credits, price_ngn, active")
      .eq("id", data.packId)
      .maybeSingle();
    if (!pack || !pack.active) throw new Error("That credit pack isn't available");
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const email = authUser?.user?.email;
    if (!email) throw new Error("Your account needs an email address to make payments");

    const reference = `aicredit_${crypto.randomUUID().replace(/-/g, "")}`;
    const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
      method: "POST",
      headers: { Authorization: `Bearer ${paystackKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        amount: pack.price_ngn * 100,
        currency: "NGN",
        channels: ["card", "bank", "ussd", "bank_transfer"],
        reference,
        callback_url: data.callbackUrl,
      }),
    });
    const body = await res.json();
    if (!res.ok || !body?.status) throw new Error(body?.message ?? "Could not start this payment");
    const { error } = await db.from("ai_topup_purchases").insert({
      store_id: data.storeId,
      pack_id: pack.id,
      credits: pack.credits,
      amount_ngn: pack.price_ngn,
      payment_reference: reference,
      created_by: context.userId,
    });
    if (error) throw new Error("Could not start this payment");
    return { authorizationUrl: body.data.authorization_url as string, reference };
  });

/**
 * Called when the owner returns from checkout. Credits are only added after
 * Paystack itself confirms the payment server-side (same idempotent path as
 * the webhook), never on the browser's word.
 */
export const confirmAiTopup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ reference: z.string().regex(/^aicredit_[a-f0-9]{32}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: purchase } = await db
      .from("ai_topup_purchases")
      .select("store_id, status, credits")
      .eq("payment_reference", data.reference)
      .maybeSingle();
    if (!purchase) return { status: "not_found" as const, credits: 0 };
    const { data: member } = await context.supabase
      .from("store_members")
      .select("status")
      .eq("store_id", purchase.store_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!member || member.status !== "active") return { status: "not_found" as const, credits: 0 };
    if (purchase.status === "success") return { status: "success" as const, credits: purchase.credits as number };

    const res = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(data.reference)}`, {
      headers: { Authorization: `Bearer ${paystackKey()}` },
    });
    const body = await res.json();
    if (!res.ok || !body?.status || body.data?.status !== "success") {
      return { status: "pending" as const, credits: 0 };
    }
    const { data: applied } = await db.rpc("apply_ai_topup", {
      p_reference: data.reference,
      p_paid_kobo: Number(body.data.amount ?? 0),
    });
    const ok = (applied as { ok?: boolean } | null)?.ok;
    return { status: ok ? ("success" as const) : ("pending" as const), credits: ok ? (purchase.credits as number) : 0 };
  });
