import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Coins,
  HeartPulse,
  Inbox,
  Layers,
  LayoutDashboard,
  LineChart,
  Menu,
  MessageSquare,
  Moon,
  Radar,
  Receipt,
  ScrollText,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  TriangleAlert,
  Users2,
  type LucideIcon,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { LogoTile } from "@/components/jaylor/app-shell";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export const ADMIN_TABS = [
  "overview",
  "search",
  "health",
  "analytics",
  "plans",
  "billing",
  "messaging",
  "ai-usage",
  "leads",
  "directory",
  "audit",
  "errors",
  "security",
  "team",
] as const;

export type AdminTab = (typeof ADMIN_TABS)[number];

export function isAdminTab(value: unknown): value is AdminTab {
  return typeof value === "string" && (ADMIN_TABS as readonly string[]).includes(value);
}

type AdminNavItem = { key: AdminTab; label: string; icon: LucideIcon; superOnly?: boolean };

const NAV: AdminNavItem[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "search", label: "Stores and users", icon: Search },
  { key: "health", label: "Health", icon: HeartPulse },
  { key: "analytics", label: "Analytics", icon: LineChart },
  { key: "plans", label: "Plans", icon: Layers },
  { key: "billing", label: "Billing", icon: Receipt },
  { key: "messaging", label: "Messaging", icon: MessageSquare },
  { key: "ai-usage", label: "AI usage", icon: Sparkles },
  { key: "leads", label: "Leads", icon: Inbox },
  { key: "directory", label: "Directory", icon: Radar },
  { key: "audit", label: "Audit log", icon: ScrollText },
  { key: "errors", label: "Errors", icon: TriangleAlert },
  { key: "security", label: "Security", icon: ShieldCheck },
  { key: "team", label: "Team", icon: Users2, superOnly: true },
];

/** "ai-costs" is the separate /admin-ai page. */
type ActiveKey = AdminTab | "ai-costs";

/**
 * Platform admin chrome, built from the same pieces as the store app's
 * AppShell (navy sidebar, gold active indicator, navy phone header) so the
 * two read as one product. Admin screens stay English only, as before.
 */
export function AdminShell({
  active,
  isSuperAdmin,
  children,
}: {
  active: ActiveKey;
  isSuperAdmin: boolean;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const items = NAV.filter((i) => !i.superOnly || isSuperAdmin);

  const nav = (onNavigate?: () => void) => (
    <>
      <nav aria-label="Admin" className="flex flex-col gap-1">
        {items.map((item) => (
          <AdminLink
            key={item.key}
            to="/admin"
            search={{ tab: item.key }}
            icon={item.icon}
            label={item.label}
            active={active === item.key}
            onNavigate={onNavigate}
          />
        ))}
        <AdminLink
          to="/admin-ai"
          icon={Coins}
          label="AI costs"
          active={active === "ai-costs"}
          onNavigate={onNavigate}
        />
      </nav>
    </>
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        <aside
          aria-label="Admin"
          className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col gap-[18px] overflow-y-auto border-r border-sidebar-border bg-sidebar px-4 py-[22px] text-on-navy lg:flex"
        >
          <Brand />
          {nav()}
          <SidebarFooter />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-navy px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] text-on-navy lg:hidden">
            <Brand compact />
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Admin menu"
              className="flex size-11 cursor-pointer items-center justify-center rounded-xl bg-navy-raised text-on-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              <Menu className="size-5" aria-hidden="true" />
            </button>
          </header>
          <main className="min-h-[70vh] min-w-0 px-4 pb-12 pt-6 lg:px-8 lg:pt-7">{children}</main>
        </div>
      </div>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          side="left"
          className="w-[280px] overflow-y-auto border-sidebar-border bg-sidebar p-4 text-on-navy"
        >
          <SheetHeader className="mb-4 text-left">
            <SheetTitle className="sr-only">Admin menu</SheetTitle>
            <Brand />
          </SheetHeader>
          {nav(() => setMenuOpen(false))}
          <div className="mt-6">
            <SidebarFooter />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Brand({ compact }: { compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", !compact && "px-1.5")}>
      <LogoTile />
      <span className="flex flex-col">
        <span className="font-display text-[19px] font-bold leading-tight">Jaylor</span>
        <span className="text-[11px] text-on-navy-muted">Platform admin</span>
      </span>
    </div>
  );
}

function AdminLink({
  to,
  search,
  icon: Icon,
  label,
  active,
  onNavigate,
}: {
  to: "/admin" | "/admin-ai";
  search?: { tab: AdminTab };
  icon: LucideIcon;
  label: string;
  active: boolean;
  onNavigate?: (() => void) | undefined;
}) {
  return (
    <Link
      to={to}
      {...(search ? { search } : {})}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-sm transition-colors",
        active
          ? "bg-navy-raised font-bold text-on-navy shadow-[inset_3px_0_0_var(--gold)]"
          : "font-semibold text-nav-text hover:bg-navy-raised hover:text-on-navy",
      )}
    >
      <Icon className="size-[18px] shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </Link>
  );
}

function SidebarFooter() {
  const { resolved, setTheme } = useTheme();
  return (
    <div className="mt-auto flex flex-col gap-1 border-t border-sidebar-border pt-4">
      <button
        type="button"
        onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}
        className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[10px] px-3 text-left text-[13px] font-semibold text-nav-text hover:bg-navy-raised hover:text-on-navy"
      >
        {resolved === "dark" ? (
          <Sun className="size-[18px]" aria-hidden="true" />
        ) : (
          <Moon className="size-[18px]" aria-hidden="true" />
        )}
        {resolved === "dark" ? "Light theme" : "Dark theme"}
      </button>
      <Link
        to="/dashboard"
        className="flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-[13px] font-semibold text-nav-text hover:bg-navy-raised hover:text-on-navy"
      >
        <ArrowLeft className="size-[18px]" aria-hidden="true" />
        Exit admin
      </Link>
    </div>
  );
}

/** Page heading in the same style as the store app (Playfair 700). */
export function AdminPageTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <h1 className="font-display text-[26px] leading-tight lg:text-[30px]">{children}</h1>
      {action}
    </div>
  );
}
