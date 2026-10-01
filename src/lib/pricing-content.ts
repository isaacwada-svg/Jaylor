import type { Tier } from "@/lib/jaylor";

export type BillingPeriod = "monthly" | "quarterly" | "yearly";

export const BILLING_PERIODS: { value: BillingPeriod; label: string; badge?: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly", badge: "2 months free" },
];

export type PriceTier = {
  tier: Tier;
  blurb: string;
  jaylorPayFee: string;
  mostPopular?: boolean;
  cta: "trial" | "custom";
  prices: Record<BillingPeriod, { total: string; perMonth: string } | null>;
  features: string[];
};

export const PRICE_TIERS: PriceTier[] = [
  {
    tier: "Free",
    blurb: "Everything you need to stop losing track of orders and money.",
    jaylorPayFee: "1.5%",
    cta: "trial",
    prices: {
      monthly: { total: "₦0", perMonth: "₦0 / month" },
      quarterly: { total: "₦0", perMonth: "₦0 / month" },
      yearly: { total: "₦0", perMonth: "₦0 / month" },
    },
    features: [
      "1 user",
      "20 orders / month",
      "Unlimited clients",
      "Unlimited tap-to-send WhatsApp",
      "Client tracking links and approvals",
      "Fabric photos and Measurement Passport",
      "Listing in the tailor directory",
    ],
  },
  {
    tier: "Growth",
    blurb: "For a growing shop that wants to look professional and plan ahead.",
    jaylorPayFee: "1%",
    mostPopular: true,
    cta: "trial",
    prices: {
      monthly: { total: "₦6,000", perMonth: "₦6,000 / month" },
      quarterly: { total: "₦15,000", perMonth: "₦5,000 / month" },
      yearly: { total: "₦54,000", perMonth: "₦4,500 / month" },
    },
    features: [
      "Everything in Free",
      "3 users",
      "Unlimited orders",
      "Your own storefront and logo on receipts",
      "On-time badge and capacity planning",
      "Quotations, group events and consultations",
      "Daily and weekly business summaries",
      "Automatic WhatsApp reminders (coming soon)",
    ],
  },
  {
    tier: "Business",
    blurb: "For a fashion house with staff, stock and reports to manage.",
    jaylorPayFee: "0.7%",
    cta: "trial",
    prices: {
      monthly: { total: "₦15,000", perMonth: "₦15,000 / month" },
      quarterly: { total: "₦40,500", perMonth: "₦13,500 / month" },
      yearly: { total: "₦144,000", perMonth: "₦12,000 / month" },
    },
    features: [
      "Everything in Growth",
      "10 users with roles",
      "Staff job board and piece-rate payroll",
      "Inventory with low-stock alerts",
      "Expenses, net profit and monthly business report",
      "Prices in pounds, dollars and cedis",
      "School and company uniform contracts",
    ],
  },
  {
    tier: "Custom",
    blurb: "Your own WhatsApp number, your own domain, and a migration from your old system.",
    jaylorPayFee: "Negotiated",
    cta: "custom",
    prices: { monthly: null, quarterly: null, yearly: null },
    features: ["Own WhatsApp number", "Own domain", "Integrations", "Migration support"],
  },
];

export type AddOn = { name: string; price: string; href?: string };

export const ADD_ONS: AddOn[] = [
  { name: "100 automatic WhatsApp messages", price: "₦2,000" },
  { name: "Extra user", price: "₦1,500 / month" },
  { name: "Extra branch", price: "₦4,000 / month" },
  {
    name: "Notebook import service (we type in your old records)",
    price: "₦10,000 one-off",
    href: "/import",
  },
  { name: "Own domain for your storefront", price: "₦3,000 / month" },
];

export type ComparisonRow = { label: string; values: Record<Tier, string> };

export const COMPARISON_ROWS: ComparisonRow[] = [
  {
    label: "Users",
    values: { Free: "1", Growth: "3", Business: "10, with roles", Custom: "Unlimited" },
  },
  {
    label: "Orders / month",
    values: { Free: "20", Growth: "Unlimited", Business: "Unlimited", Custom: "Unlimited" },
  },
  {
    label: "Clients",
    values: { Free: "Unlimited", Growth: "Unlimited", Business: "Unlimited", Custom: "Unlimited" },
  },
  {
    label: "Tap-to-send WhatsApp",
    values: { Free: "Unlimited", Growth: "Unlimited", Business: "Unlimited", Custom: "Unlimited" },
  },
  {
    label: "Client tracking links and approvals",
    values: {
      Free: "Included",
      Growth: "Included",
      Business: "Included",
      Custom: "Included",
    },
  },
  {
    label: "Fabric photos and Measurement Passport",
    values: {
      Free: "Included",
      Growth: "Included",
      Business: "Included",
      Custom: "Included",
    },
  },
  {
    label: "Listing in the tailor directory",
    values: {
      Free: "Included",
      Growth: "Included",
      Business: "Included",
      Custom: "Included",
    },
  },
  {
    label: "Storefront items",
    values: { Free: "10", Growth: "Unlimited", Business: "Unlimited", Custom: "Unlimited" },
  },
  {
    label: "Receipts",
    values: {
      Free: "Made with Jaylor",
      Growth: "Own logo",
      Business: "Own logo",
      Custom: "Own branding",
    },
  },
  {
    label: "On-time badge and capacity planning",
    values: {
      Free: "Not included",
      Growth: "Included",
      Business: "Included",
      Custom: "Included",
    },
  },
  {
    label: "Quotations, group events and consultations",
    values: {
      Free: "Not included",
      Growth: "Included",
      Business: "Included",
      Custom: "Included",
    },
  },
  {
    label: "Daily and weekly business summaries",
    values: {
      Free: "Not included",
      Growth: "Included",
      Business: "Included",
      Custom: "Included",
    },
  },
  {
    label: "Automatic WhatsApp / month",
    values: {
      Free: "Not included",
      Growth: "Coming soon",
      Business: "Coming soon",
      Custom: "Agreed volume",
    },
  },
  { label: "Branches", values: { Free: "1", Growth: "1", Business: "3", Custom: "Unlimited" } },
  {
    label: "Staff job board and piece-rate payroll",
    values: {
      Free: "Not included",
      Growth: "Not included",
      Business: "Included",
      Custom: "Included",
    },
  },
  {
    label: "Inventory with low-stock alerts",
    values: {
      Free: "Not included",
      Growth: "Not included",
      Business: "Included",
      Custom: "Included",
    },
  },
  {
    label: "Prices in pounds, dollars and cedis",
    values: {
      Free: "Not included",
      Growth: "Not included",
      Business: "Included",
      Custom: "Included",
    },
  },
  {
    label: "School and company uniform contracts",
    values: {
      Free: "Not included",
      Growth: "Not included",
      Business: "Included",
      Custom: "Included",
    },
  },
  {
    label: "Jaylor Pay fee",
    values: { Free: "1.5%", Growth: "1%", Business: "0.7%", Custom: "Negotiated" },
  },
  {
    label: "Reports",
    values: {
      Free: "Basic",
      Growth: "Money owed and collected",
      Business: "Expenses, net profit and business report",
      Custom: "Custom reports",
    },
  },
  {
    label: "Offline",
    values: { Free: "View only", Growth: "Full", Business: "Full", Custom: "Full" },
  },
];

export const PRICING_FAQ: { question: string; answer: string }[] = [
  {
    question: "How does the 14-day trial work?",
    answer:
      "Every new store starts on a 14-day Growth trial automatically, no card required. You can use every Growth feature during that time.",
  },
  {
    question: "What happens after 14 days?",
    answer:
      "If you haven't chosen a paid plan, your store moves to Free. Nothing is ever deleted: anything over the Free plan's limits just becomes read-only until you upgrade or remove it.",
  },
  {
    question: "What happens if I downgrade?",
    answer:
      "Your data stays exactly as it is. Items over your new plan's limits become read-only rather than hidden or deleted, so you can always see everything and upgrade again later.",
  },
  {
    question: "How do automatic WhatsApp messages and top-ups work?",
    answer:
      "Tap-to-send messages (sent from your own phone) are always free and unlimited on every plan. Automatic messages (sent by Jaylor on your behalf) count against your plan's monthly allowance. If you run out, you can buy a top-up of 100 messages for ₦2,000 instead of losing automatic reminders.",
  },
  {
    question: "How can I pay?",
    answer: "Card, bank transfer or USSD, through Paystack.",
  },
  {
    question: "Can I cancel anytime?",
    answer:
      "Yes. There's no lock-in contract. Cancelling moves your store to the Free plan at the end of your current billing period.",
  },
];

export const PRICING_GUARANTEE =
  "If Jaylor does not help you collect at least ten times your subscription in your first 90 days, we refund the subscription.";
