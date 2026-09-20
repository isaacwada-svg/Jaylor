// Shared Paystack helpers. Requires the PAYSTACK_SECRET_KEY secret —
// add it in Lovable Cloud once you have a live (or test) Paystack account.

const PAYSTACK_BASE = "https://api.paystack.co";

function secretKey(): string {
  const key = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!key) throw new Error("Payments aren't set up for this project yet (missing PAYSTACK_SECRET_KEY).");
  return key;
}

export async function initializeTransaction(opts: {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
}): Promise<{ authorization_url: string; access_code: string; reference: string }> {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: opts.email,
      amount: opts.amountKobo,
      currency: "NGN",
      channels: ["bank_transfer"],
      reference: opts.reference,
      callback_url: opts.callbackUrl,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data?.status) {
    throw new Error(data?.message ?? `Paystack initialize failed (${res.status})`);
  }
  return data.data;
}

export async function verifyTransaction(
  reference: string,
): Promise<{ status: string; amount: number; reference: string }> {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secretKey()}` },
  });
  const data = await res.json();
  if (!res.ok || !data?.status) {
    throw new Error(data?.message ?? `Paystack verify failed (${res.status})`);
  }
  return data.data;
}

export async function isValidWebhookSignature(rawBody: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secretKey()),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const hex = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex === signature;
}
