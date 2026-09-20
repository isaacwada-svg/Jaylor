import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Home,
  Scissors,
  Users,
  Store,
  MoreHorizontal,
  Plus,
  Mic,
  UserPlus,
  Banknote,
  PanelLeftClose,
  PanelLeft,
  ChevronsUpDown,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StitchDivider } from "./stitch-divider";
import { ThemeToggle } from "./theme-toggle";
import { TierBadge } from "./tier-badge";
import { COMPANY_LINE, effectiveTier } from "@/lib/jaylor";
import { useStore } from "@/lib/store-context";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Home", icon: Home },
  { to: "/orders", label: "Orders", icon: Scissors },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/shop", label: "Shop", icon: Store },
  { to: "/more", label: "More", icon: MoreHorizontal },
] as const;

const NEW_ACTIONS = [
  { label: "New order", icon: Scissors },
  { label: "New client", icon: UserPlus },
  { label: "Record payment", icon: Banknote },
  { label: "Voice order", icon: Mic },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const [newOpen, setNewOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { memberships, currentStore, setCurrentStoreId } = useStore();
  const tier = effectiveTier(currentStore);

  return (
    <div className="linen min-h-screen bg-background">
      <div className="flex">
        {/* Desktop sidebar */}
        <aside
          className={cn(
            "sticky top-0 hidden h-screen shrink-0 border-r border-border bg-sidebar transition-[width] duration-200 lg:block",
            collapsed ? "w-[76px]" : "w-64",
          )}
        >
          <div className="flex h-full flex-col p-4">
            <div className="flex items-center justify-between gap-2">
              {!collapsed && (
                <StoreSwitcher
                  memberships={memberships}
                  currentStoreId={currentStore?.id}
                  onSelect={setCurrentStoreId}
                />
              )}
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                aria-label={collapsed ? "Expand menu" : "Collapse menu"}
                onClick={() => setCollapsed((c) => !c)}
              >
                {collapsed ? (
                  <PanelLeft className="size-5" />
                ) : (
                  <PanelLeftClose className="size-5" />
                )}
              </Button>
            </div>
            <StitchDivider className="my-4" />
            <nav className="flex flex-col gap-1">
              {NAV.map(({ to, label, icon: Icon }) => {
                const active = to === "/" ? path === "/" : path.startsWith(to);
                return (
                  <Link
                    key={to}
                    to={to}
                    className={cn(
                      "touch-target flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                    )}
                  >
                    <Icon className={cn("size-5", active && "text-gold")} />
                    {!collapsed && label}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-6">
              <Button className="w-full" onClick={() => setNewOpen(true)}>
                <Plus className="size-4" />
                {!collapsed && "New"}
              </Button>
            </div>
            <div className="mt-auto space-y-3">
              {!collapsed && <TierBadge tier={tier} />}
              <ThemeToggle />
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile header */}
          <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border bg-background/85 px-4 py-3 backdrop-blur lg:hidden">
            <StoreSwitcher
              memberships={memberships}
              currentStoreId={currentStore?.id}
              onSelect={setCurrentStoreId}
              className="min-w-0"
            />
            <div className="flex shrink-0 items-center gap-1">
              <TierBadge tier={tier} />
              <ThemeToggle />
            </div>
          </header>

          <main className="min-h-[70vh] pb-28 lg:pb-12">{children}</main>

          <footer className="px-4 pb-24 pt-8 text-center text-xs text-muted-foreground lg:pb-8">
            {COMPANY_LINE}
          </footer>
        </div>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur lg:hidden">
        <ul className="mx-auto flex max-w-lg items-stretch justify-between px-2 py-1.5">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = to === "/" ? path === "/" : path.startsWith(to);
            return (
              <li key={to} className="flex-1">
                <Link
                  to={to}
                  className={cn(
                    "touch-target flex flex-col items-center justify-center gap-1 rounded-xl py-1.5 text-[11px] font-medium",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  <Icon className={cn("size-5", active && "text-gold")} />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Floating New button (mobile) */}
      <Button
        onClick={() => setNewOpen(true)}
        aria-label="New"
        className="fixed bottom-20 right-4 z-40 size-14 rounded-full shadow-float lg:hidden"
      >
        <Plus className="size-6" />
      </Button>

      <Sheet open={newOpen} onOpenChange={setNewOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader className="text-left">
            <SheetTitle className="text-2xl">Create</SheetTitle>
          </SheetHeader>
          <div className="grid gap-2 px-4 pb-4">
            {NEW_ACTIONS.map(({ label, icon: Icon }) => (
              <Button
                key={label}
                variant="outline"
                className="justify-start gap-3 py-6 text-base"
                onClick={() => setNewOpen(false)}
              >
                <Icon className="size-5 text-gold" />
                {label}
              </Button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function StoreSwitcher({
  memberships,
  currentStoreId,
  onSelect,
  className,
}: {
  memberships: ReturnType<typeof useStore>["memberships"];
  currentStoreId: string | undefined;
  onSelect: (id: string) => void;
  className?: string;
}) {
  const current = memberships.find((m) => m.store.id === currentStoreId) ?? memberships[0];
  if (!current) return <Wordmark />;

  const badge = (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
      <span className="font-display text-sm font-semibold">J</span>
    </span>
  );

  if (memberships.length <= 1) {
    return (
      <Link to="/dashboard" className={cn("flex min-w-0 items-center gap-2", className)}>
        {badge}
        <span className="min-w-0 truncate font-display text-lg font-semibold tracking-tight">
          {current.store.name}
        </span>
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex min-w-0 items-center gap-2 rounded-lg py-1 pr-1 text-left hover:bg-accent/60",
            className,
          )}
        >
          {badge}
          <span className="min-w-0 flex-1 truncate font-display text-base font-semibold tracking-tight">
            {current.store.name}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {memberships.map((m) => (
          <DropdownMenuItem
            key={m.store.id}
            onClick={() => onSelect(m.store.id)}
            className="flex items-center justify-between gap-2"
          >
            <span className="truncate">{m.store.name}</span>
            {m.store.id === currentStoreId && <Check className="size-4 shrink-0 text-gold" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Wordmark() {
  return (
    <Link to="/" className="flex items-center gap-2">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <span className="font-display text-sm font-semibold">J</span>
      </span>
      <span className="font-display text-lg font-semibold tracking-tight">Jaylor</span>
    </Link>
  );
}
