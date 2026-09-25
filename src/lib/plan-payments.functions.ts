import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PAYSTACK_BASE = "https://api.paystack.co";

const ALLOWED_CALLBACK_HOSTS = [
  "jaylor.com.ng",
  "www.jaylor.com.ng",
  "jaylor.lovable.app",
  "localhost",
];

function paystackKey(): string {
  const key = process.env["PAYSTACK_SECRET_KEY"];
  if (!key) throw new Error("Payments aren't set up yet. Please try again shortly.");
  return key;
}

async function paystackInitialize(opts: {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
}): Promise<{ authorization_url: string; reference: string }> {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${paystackKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: opts.email,
      amount: opts.amountKobo,
      currency: "NGN",
      channels: ["card", "bank", "ussd", "bank_transfer"],
      reference: opts.reference,
      callback_url: opts.callbackUrl,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data?.status) {
    throw new Error(data?.message ?? "Could not start this payment");
  }
  return data.data;
}

async function paystackVerify(
  reference: string,
): Promise<{ status: string; amount: number }> {
  const res = await fetch(
    `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${paystackKey()}` } },
  );
  const data = await res.json();
  if (!res.ok || !data?.status) {
    throw new Error(data?.message ?? "Could not verify this payment");
  }
  return data.data;
}

async function requireOwner(
  supabase: {
    from: (table: string) => any;
  },
  storeId: string,
  userId: string,
) {
  const { data: membership } = await supabase
    .from("store_members")
    .select("role, status")
    .eq("store_id", storeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!membership || membership.status !== "active" || membership.role !== "owner") {
    throw new Error("Only the shop owner can change the plan");
  }
}

async function userEmail(userId: string, claims: Record<string, unknown>): Promise<string> {
  if (typeof claims["email"] === "string" && claims["email"].includes("@")) {
    return claims["email"] as string;
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  const email = data?.user?.email;
  if (!email) throw new Error("Your account needs an email address to make payments");
  return email;
}

export const createPlanPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        storeId: z.string().uuid(),
        planCode: z.string().min(1).max(40),
        callbackUrl: z.string().url().max(500),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const host = new URL(data.callbackUrl).hostname;
    if (!ALLOWED_CALLBACK_HOSTS.includes(host) && !host.endsWith(".lovable.app")) {
      throw new Error("Invalid callback URL");
    }

    await requireOwner(context.supabase, data.storeId, context.userId);

    const { data: plan } = await context.supabase
      .from("plans")
      .select("code, price_quarterly")
      .eq("code", data.planCode)
      .maybeSingle();
    if (!plan || !plan.price_quarterly || Number(plan.price_quarterly) <= 0) {
      throw new Error("That plan isn't available for online payment");
    }

    const email = await userEmail(context.userId, context.claims as Record<string, unknown>);
    const reference = `plan_${crypto.randomUUID().replace(/-/g, "")}`;

    const transaction = await paystackInitialize({
      email,
      amountKobo: Math.round(Number(plan.price_quarterly) * 100),
      reference,
      callbackUrl: data.callbackUrl,
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("plan_payments").insert({
      store_id: data.storeId,
      plan_code: plan.code,
      amount: plan.price_quarterly,
      reference: transaction.reference,
    });
    if (error) throw new Error("Could not record this payment. Please try again.");

    return { authorizationUrl: transaction.authorization_url, reference: transaction.reference };
  });

export const verifyPlanPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ reference: z.string().min(1).max(200) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: payment } = await supabaseAdmin
      .from("plan_payments")
      .select("id, status, store_id, plan_code, amount")
      .eq("reference", data.reference)
      .maybeSingle();
    if (!payment) throw new Error("Payment not found");

    await requireOwner(context.supabase, payment.store_id, context.userId);

    if (payment.status === "success") {
      return { status: "success" as const, planCode: payment.plan_code };
    }

    const transaction = await paystackVerify(data.reference);
    const expectedKobo = Math.round(Number(payment.amount) * 100);
    if (transaction.status !== "success" || Number(transaction.amount ?? 0) < expectedKobo) {
      return { status: "failed" as const, planCode: payment.plan_code };
    }

    const { data: updated, error } = await supabaseAdmin
      .from("plan_payments")
      .update({ status: "success", paid_at: new Date().toISOString() })
      .eq("id", payment.id)
      .eq("status", "pending")
      .select("id");
    if (error) throw new Error("Could not confirm this payment");

    if (updated && updated.length > 0) {
      const paidUntil = new Date();
      paidUntil.setMonth(paidUntil.getMonth() + 3);
      const { error: storeError } = await supabaseAdmin
        .from("stores")
        .update({ plan_code: payment.plan_code, plan_paid_until: paidUntil.toISOString() })
        .eq("id", payment.store_id);
      if (storeError) throw new Error("Payment received but the plan could not be activated — contact us");
    }

    return { status: "success" as const, planCode: payment.plan_code };
  });

export const chooseFreePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ storeId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await requireOwner(context.supabase, data.storeId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("stores")
      .update({ plan_code: "free", plan_paid_until: null })
      .eq("id", data.storeId);
    if (error) throw new Error("Could not switch plans. Please try again.");
    return { ok: true };
  });
