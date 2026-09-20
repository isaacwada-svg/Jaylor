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
  channels?: string[];
  subaccount?: string;
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
      channels: opts.channels ?? ["bank_transfer"],
      reference: opts.reference,
      callback_url: opts.callbackUrl,
      ...(opts.subaccount ? { subaccount: opts.subaccount } : {}),
    }),
  });
  const data = await res.json();
  if (!res.ok || !data?.status) {
    throw new Error(data?.message ?? `Paystack initialize failed (${res.status})`);
  }
  return data.data;
}

export async function listBanks(): Promise<{ name: string; code: string }[]> {
  const res = await fetch(`${PAYSTACK_BASE}/bank?currency=NGN&country=nigeria`, {
    headers: { Authorization: `Bearer ${secretKey()}` },
  });
  const data = await res.json();
  if (!res.ok || !data?.status) {
    throw new Error(data?.message ?? `Paystack bank list failed (${res.status})`);
  }
  return (data.data as { name: string; code: string }[]).map((b) => ({
    name: b.name,
    code: b.code,
  }));
}

export async function resolveAccountNumber(
  accountNumber: string,
  bankCode: string,
): Promise<{ account_number: string; account_name: string }> {
  const res = await fetch(
    `${PAYSTACK_BASE}/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
    { headers: { Authorization: `Bearer ${secretKey()}` } },
  );
  const data = await res.json();
  if (!res.ok || !data?.status) {
    throw new Error(data?.message ?? "Could not verify that account number");
  }
  return data.data;
}

export async function createSubaccount(opts: {
  businessName: string;
  bankCode: string;
  accountNumber: string;
  percentageCharge: number;
}): Promise<{ subaccount_code: string }> {
  const res = await fetch(`${PAYSTACK_BASE}/subaccount`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      business_name: opts.businessName,
      settlement_bank: opts.bankCode,
      account_number: opts.accountNumber,
      percentage_charge: opts.percentageCharge,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data?.status) {
    throw new Error(data?.message ?? `Could not connect that account (${res.status})`);
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
