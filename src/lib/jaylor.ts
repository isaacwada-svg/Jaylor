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

export function planCodeToTier(planCode: string | null | undefined): Tier {
  switch (planCode) {
    case "free":
      return "Free";
    case "business":
      return "Business";
    case "custom":
      return "Custom";
    default:
      return "Growth";
  }
}

/**
 * Every new store gets a 14-day Growth trial before it settles onto its
 * real plan, so the displayed tier isn't just the raw plan_code column
 * while trial_ends_at is still in the future.
 */
export function effectiveTier(
  store:
    | {
        plan_code: string | null;
        trial_ends_at: string | null;
      }
    | null
    | undefined,
): Tier {
  if (!store) return "Growth";
  if (store.trial_ends_at && new Date(store.trial_ends_at) > new Date()) return "Growth";
  return planCodeToTier(store.plan_code);
}

export const COMPANY_LINE =
  "Jaylor is a product of Bethjay Global Enterprise Limited — Abuja, Nigeria.";
