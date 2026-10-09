import {
  BarChart3,
  Boxes,
  Calculator,
  CalendarDays,
  Coins,
  FileText,
  Gift,
  Home,
  LifeBuoy,
  Radar,
  Scissors,
  Settings,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
  Users2,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Tier } from "@/lib/jaylor";
import type { DiscoveryFeature } from "@/lib/feature-discovery";

type Role = "owner" | "manager" | "tailor";

export type NavBadgeKey = "orders" | "fittings" | "low_stock";

export type AppNavItem = {
  key: string;
  /** app_common key for the label; `fallback` is the English source. */
  labelKey: string;
  fallback: string;
  to: string;
  search?: Record<string, string>;
  hash?: string;
  icon: LucideIcon;
  /** Lowest plan that includes it; below that the item shows a lock. */
  tier?: Tier;
  roles?: Role[];
  badge?: NavBadgeKey;
  feature?: DiscoveryFeature;
  /** Also matches these path prefixes for the active state. */
  match?: string[];
};

/** Main sidebar items, in the order of the approved mockup. */
export const MAIN_NAV: AppNavItem[] = [
  { key: "home", labelKey: "nav_home", fallback: "Home", to: "/dashboard", icon: Home },
  {
    key: "orders",
    labelKey: "nav_orders",
    fallback: "Orders",
    to: "/orders",
    icon: Scissors,
    badge: "orders",
  },
  { key: "clients", labelKey: "nav_clients", fallback: "Clients", to: "/clients", icon: Users },
  {
    key: "payments",
    labelKey: "nav_payments",
    fallback: "Payments",
    to: "/payments",
    icon: Wallet,
    match: ["/unmatched-payments"],
  },
  {
    key: "fittings",
    labelKey: "nav_fittings",
    fallback: "Fittings",
    to: "/consultations",
    icon: CalendarDays,
    tier: "Growth",
    badge: "fittings",
  },
  { key: "shop", labelKey: "nav_shop", fallback: "Shop", to: "/shop", icon: Store },
  {
    key: "payroll",
    labelKey: "nav_payroll",
    fallback: "Payroll",
    to: "/payroll",
    icon: Coins,
    tier: "Business",
    roles: ["owner", "manager"],
  },
  {
    key: "my-earnings",
    labelKey: "nav_my_earnings",
    fallback: "My earnings",
    to: "/my-earnings",
    icon: Coins,
    roles: ["tailor"],
  },
  {
    key: "inventory",
    labelKey: "nav_inventory",
    fallback: "Inventory",
    to: "/inventory",
    icon: Boxes,
    tier: "Business",
    badge: "low_stock",
  },
  {
    key: "reports",
    labelKey: "nav_reports",
    fallback: "Reports",
    to: "/reports",
    icon: BarChart3,
    tier: "Business",
  },
  {
    key: "settings",
    labelKey: "nav_settings",
    fallback: "Settings",
    to: "/billing",
    icon: Settings,
  },
];

/** The rest of the More screen's items, grouped under "More" on desktop. */
export const MORE_NAV: AppNavItem[] = [
  {
    key: "events",
    labelKey: "nav_events",
    fallback: "Group events",
    to: "/events",
    icon: Users2,
    tier: "Growth",
    feature: "group_orders",
  },
  {
    key: "quotations",
    labelKey: "nav_quotations",
    fallback: "Quotations",
    to: "/quotations",
    icon: Calculator,
    tier: "Growth",
  },
  {
    key: "contracts",
    labelKey: "nav_contracts",
    fallback: "Contracts",
    to: "/contracts",
    icon: FileText,
    tier: "Business",
  },
  {
    key: "staff",
    labelKey: "nav_staff",
    fallback: "Staff and job board",
    to: "/staff",
    icon: Users2,
    tier: "Business",
  },
  {
    key: "business-report",
    labelKey: "nav_business_report",
    fallback: "Business report",
    to: "/business-report",
    icon: BarChart3,
    tier: "Business",
  },
  { key: "moments", labelKey: "nav_moments", fallback: "Moments", to: "/moments", icon: Gift },
  {
    key: "ai",
    labelKey: "nav_ai_tools",
    fallback: "AI tools",
    to: "/ai-designs",
    icon: Sparkles,
    tier: "Growth",
    feature: "ai_design",
    match: ["/ai-studio", "/festive"],
  },
  {
    key: "directory",
    labelKey: "nav_directory",
    fallback: "Directory listing",
    to: "/shop",
    search: { tab: "profile" },
    hash: "directory-listing",
    icon: Radar,
  },
  {
    key: "privacy",
    labelKey: "nav_privacy",
    fallback: "Privacy and data",
    to: "/privacy",
    icon: ShieldCheck,
  },
  {
    key: "support",
    labelKey: "nav_support",
    fallback: "Contact and support",
    to: "/contact",
    icon: LifeBuoy,
  },
];

const TIER_RANK: Record<Tier, number> = { Free: 0, Growth: 1, Business: 2, Custom: 3 };

export function isLocked(item: AppNavItem, tier: Tier): boolean {
  return !!item.tier && TIER_RANK[tier] < TIER_RANK[item.tier];
}

export function visibleFor(items: AppNavItem[], role: Role | null): AppNavItem[] {
  return items.filter((item) => !item.roles || (role !== null && item.roles.includes(role)));
}

export function isActive(item: AppNavItem, path: string): boolean {
  // The directory listing lives inside Shop; only Shop itself lights up.
  if (item.hash) return false;
  const prefixes = [item.to, ...(item.match ?? [])];
  return prefixes.some((p) => path === p || path.startsWith(`${p}/`));
}
