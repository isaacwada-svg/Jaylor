import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS_HEADERS, errorResponse, jsonResponse } from "../_shared/ai.ts";
import { initializeTransaction } from "../_shared/paystack.ts";

const DESIGN_FEE_KOBO = 30000; // ₦300

const ALLOWED_ORIGINS = [
  "https://jaylor.com.ng",
  "https://www.jaylor.com.ng",
  "https://jaylor.lovable.app",
];

/** Payment redirects may only return to Jaylor's own sites (and Lovable previews). */
function isAllowedCallbackUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 500) return false;
  try {
    const url = new URL(value);
    if (url.hostname === "localhost") return true;
    if (url.protocol !== "https:") return false;
    return ALLOWED_ORIGINS.includes(url.origin) || url.hostname.endsWith(".lovable.app");
  } catch {
    return false;
  }
}

type RequestBody = {
  storeId?: string;
  phone?: string;
  callbackUrl?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }
  if (typeof body.storeId !== "string" || typeof body.phone !== "string" || !body.callbackUrl) {
    return errorResponse("storeId, phone and callbackUrl are required");
  }
  const phone = body.phone.trim();
  if (!/^\+?[0-9]{8,15}$/.test(phone)) return errorResponse("Invalid phone number");
  if (!isAllowedCallbackUrl(body.callbackUrl)) return errorResponse("Invalid callbackUrl");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Guests can only pay for designs from a real, active shop.
  const { data: store } = await supabase
    .from("stores")
    .select("id, is_active")
    .eq("id", body.storeId)
    .maybeSingle();
  if (!store || !store.is_active) return errorResponse("Shop not found", 404);

  const reference = `design_${crypto.randomUUID().replace(/-/g, "")}`;
  const digitsOnly = phone.replace(/\D/g, "");

  try {
    const transaction = await initializeTransaction({
      email: `${digitsOnly}@guest.jaylor.app`,
      amountKobo: DESIGN_FEE_KOBO,
      reference,
      callbackUrl: body.callbackUrl,
    });

    const { error } = await supabase.from("ai_design_payments").insert({
      store_id: store.id,
      phone,
      reference: transaction.reference,
      amount: DESIGN_FEE_KOBO,
    });
    if (error) throw error;

    return jsonResponse({
      authorization_url: transaction.authorization_url,
      reference: transaction.reference,
    });
  } catch (error) {
    console.error("[create-design-payment]", error);
    return errorResponse("Could not start payment", 500);
  }
});
