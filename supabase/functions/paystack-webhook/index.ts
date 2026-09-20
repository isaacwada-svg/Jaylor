import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isValidWebhookSignature } from "../_shared/paystack.ts";

// Configure this URL as the webhook endpoint in your Paystack dashboard.
// Belt-and-suspenders alongside verify-design-payment: covers the case where
// the customer closes the tab before returning from Paystack's checkout.

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature");

  let valid: boolean;
  try {
    valid = await isValidWebhookSignature(rawBody, signature);
  } catch {
    return new Response("Not configured", { status: 500 });
  }
  if (!valid) return new Response("Invalid signature", { status: 401 });

  const event = JSON.parse(rawBody);
  if (event.event !== "charge.success") {
    return new Response("ignored", { status: 200 });
  }

  const reference = event.data?.reference;
  if (!reference) return new Response("ok", { status: 200 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  await supabase
    .from("ai_design_payments")
    .update({ status: "success", verified_at: new Date().toISOString() })
    .eq("reference", reference)
    .eq("status", "pending");

  return new Response("ok", { status: 200 });
});
