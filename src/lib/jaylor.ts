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

/** Lowercase values as stored in the `orders.status` column, in track order. */
export const ORDER_STATUSES_DB = [
  "received",
  "cutting",
  "sewing",
  "fitting",
  "adjustments",
  "ready",
  "collected",
] as const;

export type OrderStatusDb = (typeof ORDER_STATUSES_DB)[number] | "cancelled";

export function orderStatusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export type Tier = "Free" | "Growth" | "Business" | "Custom";

export const GARMENT_TYPES = [
  "Agbada",
  "Kaftan",
  "Senator",
  "Iro and buba",
  "Gown",
  "Skirt and blouse",
  "Suit",
  "Shirt",
  "Trousers",
  "Bridal",
  "Children's wear",
  "Other",
] as const;

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

/** Age in whole years as of today, from an ISO date string. */
export function ageInYears(birthday: string | null | undefined): number | null {
  if (!birthday) return null;
  const dob = new Date(birthday);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

/** True if the birthday (ISO date string) makes this person under 18 today. */
export function isMinor(birthday: string | null | undefined): boolean {
  const age = ageInYears(birthday);
  return age !== null && age < 18;
}

export type AgeGroup = "baby" | "child" | "teen" | "adult";

/** 0-2 baby, 3-12 child, 13-17 teen, 18+ adult; unknown birthday defaults to adult. */
export function computeAgeGroup(birthday: string | null | undefined): AgeGroup {
  const age = ageInYears(birthday);
  if (age === null) return "adult";
  if (age <= 2) return "baby";
  if (age <= 12) return "child";
  if (age <= 17) return "teen";
  return "adult";
}

export type TemplateSex = "female" | "male" | "unisex";

export function computeTemplateSex(gender: string | null | undefined): TemplateSex {
  if (gender === "female") return "female";
  if (gender === "male") return "male";
  return "unisex";
}

export const EXPENSE_CATEGORIES: { value: string; label: string }[] = [
  { value: "fabric", label: "Fabric" },
  { value: "thread_accessories", label: "Thread and accessories" },
  { value: "fuel_power", label: "Fuel and power" },
  { value: "rent", label: "Rent" },
  { value: "salaries", label: "Salaries" },
  { value: "transport", label: "Transport" },
  { value: "marketing", label: "Marketing" },
  { value: "other", label: "Other" },
];

export const PRICING_PLANS: {
  tier: Tier;
  price: string;
  billing: string;
  blurb: string;
  features: string[];
}[] = [
  {
    tier: "Free",
    price: "₦0",
    billing: "forever",
    blurb: "Everything you need to stop losing track of orders and money.",
    features: [
      "1 user",
      "15 orders / month",
      "Unlimited clients",
      "WhatsApp tap-to-send",
      "10 storefront items",
      "Receipts with a Jaylor footer",
      "Offline, read-only",
    ],
  },
  {
    tier: "Growth",
    price: "₦5,000",
    billing: "/month, billed ₦15,000 quarterly",
    blurb: "For a growing shop that wants automatic reminders and its own storefront.",
    features: [
      "3 users",
      "Unlimited orders",
      "300 automatic WhatsApp / month",
      "Own logo on receipts",
      "Unlimited storefront items",
      "Public booking page and video consultations",
      "1 active group event",
      "Full offline",
    ],
  },
  {
    tier: "Business",
    price: "₦10,000",
    billing: "/month, billed ₦30,000 quarterly",
    blurb: "For a fashion house with staff, stock and reports to manage.",
    features: [
      "10 users with roles",
      "Up to 3 branches",
      "Staff job board",
      "Expenses and net profit",
      "1,000 automatic WhatsApp / month",
      "Unlimited events",
      "AI WhatsApp assistant",
    ],
  },
  {
    tier: "Custom",
    price: "By quote",
    billing: "talk to us",
    blurb: "Your own WhatsApp number, your own domain, and a migration from your old system.",
    features: ["Own WhatsApp number", "Own domain", "Integrations", "Migration support"],
  },
];

/** Team seats per plan tier (Custom is unlimited). Enforced client-side only. */
export const STAFF_LIMITS: Record<Tier, number> = {
  Free: 1,
  Growth: 3,
  Business: 10,
  Custom: Infinity,
};

/** sessionStorage key holding a store invite token while the user signs in. */
export const PENDING_INVITE_KEY = "jaylor:pendingInvite";

export const COMPANY_LINE =
  "Jaylor is a product of Bethjay Global Enterprise Limited — Abuja, Nigeria.";
