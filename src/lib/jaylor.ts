export const ORDER_STATUSES = [
  "Received",
  "Cutting",
  "Sewing",
  "Fitting",
  "Adjustments",
  "Ready",
  "Collected",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type Tier = "Free" | "Growth" | "Business" | "Custom";

/** Formats an amount using the store currency, e.g. ₦85,000 */
export function formatMoney(amount: number, currency = "NGN", locale = "en-NG") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    currencyDisplay: "narrowSymbol",
  }).format(amount);
}

export const COMPANY_LINE =
  "Jaylor is a product of Bethjay Global Enterprise Limited — Abuja, Nigeria.";
