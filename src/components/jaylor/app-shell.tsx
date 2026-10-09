import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Home,
  Scissors,
  Users,
  Menu,
  Plus,
  Mic,
  UserPlus,
  Banknote,
  ChevronDown,
  ChevronsUpDown,
  Check,
  Lock,
  LogOut,
  Moon,
  Search,
  Settings,
  Sun,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OfflineBanner } from "./offline-banner";
import { ClientForm } from "./client-form";
import { OrderForm, type OrderPrefill } from "./order-form";
import { VoiceOrderDialog } from "./voice-order-dialog";
import { DiscoveryCue } from "./discovery-cue";
import { FeatureTour } from "./feature-tour";
import { AdvisorPanel } from "./advisor-panel";
import { NotificationBell } from "./notification-bell";
import { SearchPanel } from "./global-search";
import {
  MAIN_NAV,
  MORE_NAV,
  isActive,
  isLocked,
  visibleFor,
  type AppNavItem,
  type NavBadgeKey,
} from "./app-nav";
import { COMPANY_LINE, effectiveTier } from "@/lib/jaylor";
import { useStore, type StoreMembership } from "@/lib/store-context";
import { useFeatureDiscovery, type DiscoveryFeature } from "@/lib/feature-discovery";
import { useHomeDashboard } from "@/lib/home-dashboard";
import { useTheme } from "@/lib/theme";
import { cn, getErrorMessage, initialsOf } from "@/lib/utils";
import { initOutboxSync } from "@/lib/offline/outbox";
import { supabase } from "@/integrations/supabase/client";
import { useAppT } from "@/lib/i18n/i18n-context";
import { useRoleLabel } from "@/lib/i18n/app-labels";

const IMPERSONATION_KEY = "jaylor_support_session";

/** Picks up the ?impersonating=1 flag a support-login link lands on, and remembers it
 *  for the rest of this tab's session so the warning banner survives navigation. */
function useImpersonationSession() {
  const [session, setSession] = useState<{ store: string } | null>(() => {
    try {
      const raw = sessionStorage.getItem(IMPERSONATION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("impersonating") !== "1") return;
    const next = { store: params.get("store") ?? "this store" };
    try {
      sessionStorage.setItem(IMPERSONATION_KEY, JSON.stringify(next));
    } catch {
      // ignore storage failures
    }
    setSession(next);
    params.delete("impersonating");
    params.delete("support_admin");
    params.delete("store");
    const cleanSearch = params.toString();
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (cleanSearch ? `?${cleanSearch}` : ""),
    );
  }, []);

  function end() {
    try {
      sessionStorage.removeItem(IMPERSONATION_KEY);
    } catch {
      // ignore storage failures
    }
    setSession(null);
  }

  return { session, end };
}

function useUserProfile() {
  return useQuery({
    queryKey: ["my-auth-user"],
    staleTime: Infinity,
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      const fullName =
        (data.user?.user_metadata as { full_name?: string } | undefined)?.full_name?.trim() ?? "";
      return { fullName, email: data.user?.email ?? "" };
    },
  });
}

type ShellActions = {
  openNewOrder: () => void;
  openNewClient: () => void;
  openCreate: () => void;
  openSearch: () => void;
  recordPayment: () => void;
  bookFitting: () => void;
  openVoiceOrder: () => void;
  canManageOrders: boolean;
};

const ShellActionsContext = createContext<ShellActions | null>(null);

/** New order, Add client, search and the rest, for pages inside AppShell. */
export function useShellActions(): ShellActions {
  const ctx = useContext(ShellActionsContext);
  if (!ctx) throw new Error("useShellActions must be used inside AppShell");
  return ctx;
}

export function AppShell({
  children,
  mobileHeader = "compact",
}: {
  children: ReactNode;
  /** "none" when the page draws its own navy header (Home). */
  mobileHeader?: "compact" | "none";
}) {
  const t = useAppT("app_common");
  const [createOpen, setCreateOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [clientFormOpen, setClientFormOpen] = useState(false);
  const [orderFormOpen, setOrderFormOpen] = useState(false);
  const [voiceOrderOpen, setVoiceOrderOpen] = useState(false);
  const [orderPrefill, setOrderPrefill] = useState<OrderPrefill | null>(null);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { memberships, currentStore, currentRole, setCurrentStoreId } = useStore();
  const tier = effectiveTier(currentStore);
  const canManageOrders = currentRole === "owner" || currentRole === "manager";
  const discovery = useFeatureDiscovery();
  const { session: supportSession, end: endSupportSession } = useImpersonationSession();
  const { data: dashboard } = useHomeDashboard(currentStore?.id);

  useEffect(() => initOutboxSync(), []);

  const badges: Record<NavBadgeKey, number> = {
    orders: dashboard?.work.due_soon_count ?? 0,
    fittings: dashboard?.fittings?.count ?? 0,
    low_stock: dashboard?.low_stock?.count ?? 0,
  };

  async function exitSupportSession() {
    endSupportSession();
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  const actions = useMemo<ShellActions>(
    () => ({
      openNewOrder: () => (canManageOrders ? setOrderFormOpen(true) : setCreateOpen(true)),
      openNewClient: () => setClientFormOpen(true),
      openCreate: () => setCreateOpen(true),
      openSearch: () => setSearchOpen(true),
      recordPayment: () => navigate({ to: "/orders" }),
      bookFitting: () => navigate({ to: "/consultations" }),
      openVoiceOrder: () => setVoiceOrderOpen(true),
      canManageOrders,
    }),
    [canManageOrders, navigate],
  );

  const createActions: {
    label: string;
    icon: typeof Scissors;
    onClick: () => void;
    feature?: DiscoveryFeature;
  }[] = [
    ...(canManageOrders
      ? [
          {
            label: t("new_order") || "New order",
            icon: Scissors,
            onClick: () => setOrderFormOpen(true),
          },
        ]
      : []),
    {
      label: t("new_client") || "New client",
      icon: UserPlus,
      onClick: () => setClientFormOpen(true),
    },
    ...(canManageOrders
      ? [
          {
            label: t("record_payment") || "Record payment",
            icon: Banknote,
            onClick: () => navigate({ to: "/orders" }),
          },
          {
            label: t("voice_order") || "Voice order",
            icon: Mic,
            onClick: () => setVoiceOrderOpen(true),
            feature: "voice_order" as const,
          },
        ]
      : []),
  ];

  return (
    <ShellActionsContext.Provider value={actions}>
      <div className="min-h-screen bg-background">
        {supportSession && (
          <div className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-2 bg-owed px-4 py-2 text-xs font-medium text-white">
            <span>
              Support view: signed in as the owner of {supportSession.store}. This session expires
              automatically and is logged in that store&apos;s audit trail.
            </span>
            <button
              type="button"
              className="shrink-0 underline underline-offset-2"
              onClick={exitSupportSession}
            >
              Exit support view
            </button>
          </div>
        )}
        <OfflineBanner storeId={currentStore?.id} />
        <div className="flex">
          <aside
            data-tour="sidebar"
            aria-label={t("main_nav") || "Main"}
            className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col gap-[18px] overflow-y-auto border-r border-sidebar-border bg-sidebar px-4 py-[22px] text-on-navy lg:flex"
          >
            <div className="flex items-center gap-2.5 px-1.5">
              <LogoTile />
              <span className="flex flex-col">
                <span className="font-display text-[19px] font-bold leading-tight">Jaylor</span>
                <span className="text-[11px] text-on-navy-muted">
                  {t("brand_tagline") || "Crafted for you"}
                </span>
              </span>
            </div>

            <SidebarStoreSwitcher
              memberships={memberships}
              currentStoreId={currentStore?.id}
              onSelect={setCurrentStoreId}
            />

            <nav className="flex flex-col gap-1">
              {visibleFor(MAIN_NAV, currentRole).map((item) => (
                <SidebarLink
                  key={item.key}
                  item={item}
                  path={path}
                  locked={isLocked(item, tier)}
                  badge={item.badge ? badges[item.badge] : 0}
                />
              ))}
            </nav>

            <div className="flex flex-col gap-1">
              <p className="px-3 pt-1 text-[11px] font-bold uppercase tracking-[0.6px] text-on-navy-muted">
                {t("nav_more") || "More"}
              </p>
              {visibleFor(MORE_NAV, currentRole).map((item) => (
                <SidebarLink
                  key={item.key}
                  item={item}
                  path={path}
                  locked={isLocked(item, tier)}
                  badge={0}
                  compact
                  cue={
                    item.feature
                      ? {
                          show: discovery.isUnseen(item.feature),
                          pulse: discovery.shouldPulse(item.feature),
                        }
                      : undefined
                  }
                />
              ))}
              {canManageOrders && (
                <button
                  type="button"
                  onClick={() => setVoiceOrderOpen(true)}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[10px] px-3 text-left text-[13px] font-semibold text-nav-text transition-colors hover:bg-navy-raised hover:text-on-navy"
                >
                  <DiscoveryCue
                    show={discovery.isUnseen("voice_order")}
                    pulse={discovery.shouldPulse("voice_order")}
                  >
                    <Mic className="size-[18px]" aria-hidden="true" />
                  </DiscoveryCue>
                  {t("voice_order") || "Voice order"}
                </button>
              )}
            </div>

            <div className="mt-auto flex items-center gap-2 border-t border-sidebar-border pt-4">
              <ProfileMenu />
              {currentStore && canManageOrders && (
                <NotificationBell storeId={currentStore.id} tone="dark" />
              )}
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            {mobileHeader === "compact" && (
              <header className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-navy px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] text-on-navy lg:hidden">
                <MobileStoreSwitcher
                  memberships={memberships}
                  currentStoreId={currentStore?.id}
                  onSelect={setCurrentStoreId}
                  compact
                />
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => setSearchOpen(true)}
                    aria-label={t("search_aria") || "Search orders and clients"}
                    className="flex size-11 cursor-pointer items-center justify-center rounded-xl bg-navy-raised text-on-navy"
                  >
                    <Search className="size-5" aria-hidden="true" />
                  </button>
                  {currentStore && canManageOrders && (
                    <NotificationBell storeId={currentStore.id} tone="dark" />
                  )}
                </div>
              </header>
            )}

            <main className="min-h-[70vh] pb-[calc(108px+env(safe-area-inset-bottom))] lg:pb-12">
              {children}
            </main>

            <footer className="px-4 pb-[calc(100px+env(safe-area-inset-bottom))] pt-8 text-center text-xs text-muted-foreground lg:pb-8">
              {COMPANY_LINE}
            </footer>
          </div>
        </div>

        <BottomBar path={path} ordersBadge={badges.orders} onNew={actions.openNewOrder} />

        <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
          <DialogContent className="top-4 max-w-[calc(100%-2rem)] translate-y-0 rounded-2xl p-4 sm:max-w-lg">
            <DialogHeader className="text-left">
              <DialogTitle className="text-lg">{t("search_title") || "Search"}</DialogTitle>
            </DialogHeader>
            <SearchPanel
              storeId={currentStore?.id}
              variant="stacked"
              autoFocus
              onNavigate={() => setSearchOpen(false)}
            />
          </DialogContent>
        </Dialog>

        <Sheet open={createOpen} onOpenChange={setCreateOpen}>
          <SheetContent side="bottom" className="rounded-t-2xl">
            <SheetHeader className="text-left">
              <SheetTitle className="text-2xl">{t("create_title") || "Create"}</SheetTitle>
            </SheetHeader>
            <div className="grid gap-2 px-4 pb-4">
              {createActions.map(({ label, icon: Icon, onClick, feature }) => (
                <Button
                  key={label}
                  variant="outline"
                  className="h-14 justify-start gap-3 text-base"
                  onClick={() => {
                    setCreateOpen(false);
                    onClick();
                  }}
                >
                  {feature ? (
                    <DiscoveryCue
                      show={discovery.isUnseen(feature)}
                      pulse={discovery.shouldPulse(feature)}
                    >
                      <Icon className="size-5 text-gold" />
                    </DiscoveryCue>
                  ) : (
                    <Icon className="size-5 text-gold" />
                  )}
                  {label}
                </Button>
              ))}
            </div>
          </SheetContent>
        </Sheet>

        {currentStore && (
          <>
            <ClientForm
              open={clientFormOpen}
              onOpenChange={setClientFormOpen}
              storeId={currentStore.id}
              onSaved={(client) => {
                queryClient.invalidateQueries({ queryKey: ["clients", currentStore.id] });
                navigate({ to: "/clients/$clientId", params: { clientId: client.id } });
              }}
            />
            <OrderForm
              open={orderFormOpen}
              onOpenChange={(o) => {
                setOrderFormOpen(o);
                if (!o) setOrderPrefill(null);
              }}
              storeId={currentStore.id}
              prefill={orderPrefill}
              onSaved={(order) => {
                queryClient.invalidateQueries({ queryKey: ["orders", currentStore.id] });
                queryClient.invalidateQueries({ queryKey: ["home-dashboard", currentStore.id] });
                navigate({ to: "/orders/$orderId", params: { orderId: order.id } });
              }}
            />
            <VoiceOrderDialog
              open={voiceOrderOpen}
              onOpenChange={setVoiceOrderOpen}
              storeId={currentStore.id}
              canRecordAudio={tier !== "Free"}
              onParsed={(prefill) => {
                void discovery.markUsed("voice_order");
                setOrderPrefill(prefill);
                setOrderFormOpen(true);
              }}
            />
          </>
        )}

        {currentStore && canManageOrders && (
          <AdvisorPanel
            storeId={currentStore.id}
            storeCreatedAt={currentStore.created_at}
            onOrderDraft={(prefill) => {
              setOrderPrefill(prefill);
              setOrderFormOpen(true);
            }}
          />
        )}

        <FeatureTour />
      </div>
    </ShellActionsContext.Provider>
  );
}

/** The gold "J" tile from the mockups. */
export function LogoTile({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-gold font-display text-[19px] font-bold text-navy",
        className,
      )}
    >
      J
    </span>
  );
}

function SidebarLink({
  item,
  path,
  locked,
  badge,
  compact,
  cue,
}: {
  item: AppNavItem;
  path: string;
  locked: boolean;
  badge: number;
  compact?: boolean;
  cue?: { show: boolean; pulse: boolean } | undefined;
}) {
  const t = useAppT("app_common");
  const discovery = useFeatureDiscovery();
  const active = isActive(item, path);
  const Icon = item.icon;
  const label = t(item.labelKey) || item.fallback;
  const icon = <Icon className="size-[18px] shrink-0" aria-hidden="true" />;
  return (
    <Link
      to={item.to}
      {...(item.search ? { search: item.search } : {})}
      {...(item.hash ? { hash: item.hash } : {})}
      aria-current={active ? "page" : undefined}
      onClick={() => {
        if (item.feature) void discovery.markUsed(item.feature);
      }}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-[10px] px-3 transition-colors",
        compact ? "text-[13px]" : "text-sm",
        active
          ? "bg-navy-raised font-bold text-on-navy shadow-[inset_3px_0_0_var(--gold)]"
          : "font-semibold text-nav-text hover:bg-navy-raised hover:text-on-navy",
      )}
    >
      {cue ? (
        <DiscoveryCue show={cue.show} pulse={cue.pulse}>
          {icon}
        </DiscoveryCue>
      ) : (
        icon
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {locked ? (
        <Lock
          className="size-3.5 shrink-0 text-on-navy-muted"
          aria-label={t("locked_upgrade") || "Upgrade to unlock"}
        />
      ) : badge > 0 ? (
        <span className="num rounded-full bg-gold px-[7px] py-px text-[11px] text-navy">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );
}

function SidebarStoreSwitcher({
  memberships,
  currentStoreId,
  onSelect,
}: {
  memberships: StoreMembership[];
  currentStoreId: string | undefined;
  onSelect: (id: string) => void;
}) {
  const t = useAppT("app_common");
  const current = memberships.find((m) => m.store.id === currentStoreId) ?? memberships[0];
  if (!current) return null;
  const body = (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-[0.6px] text-on-navy-muted">
        {t("store_label") || "Store"}
      </span>
      <span className="truncate text-[13px] font-bold">{current.store.name}</span>
    </span>
  );
  if (memberships.length <= 1) {
    return (
      <div className="flex min-h-[52px] items-center rounded-xl bg-navy-raised px-3 py-2">
        {body}
      </div>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-tour="store-switcher"
          aria-label={t("switch_store") || "Switch store"}
          className="flex min-h-[52px] cursor-pointer items-center justify-between gap-2 rounded-xl bg-navy-raised px-3 py-2 text-left text-on-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          {body}
          <ChevronsUpDown className="size-4 shrink-0" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <StoreMenu memberships={memberships} currentStoreId={currentStoreId} onSelect={onSelect} />
    </DropdownMenu>
  );
}

function StoreMenu({
  memberships,
  currentStoreId,
  onSelect,
}: {
  memberships: StoreMembership[];
  currentStoreId: string | undefined;
  onSelect: (id: string) => void;
}) {
  return (
    <DropdownMenuContent align="start" className="w-60">
      {memberships.map((m) => (
        <DropdownMenuItem
          key={m.store.id}
          onClick={() => onSelect(m.store.id)}
          className="flex min-h-11 items-center justify-between gap-2"
        >
          <span className="truncate">{m.store.name}</span>
          {m.store.id === currentStoreId && <Check className="size-4 shrink-0 text-gold" />}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  );
}

/** Logo tile + "Store" + name, on the navy phone header. A dropdown only
 *  when the user belongs to more than one store. */
export function MobileStoreSwitcher({
  memberships,
  currentStoreId,
  onSelect,
  compact,
}: {
  memberships: StoreMembership[];
  currentStoreId: string | undefined;
  onSelect: (id: string) => void;
  compact?: boolean;
}) {
  const t = useAppT("app_common");
  const current = memberships.find((m) => m.store.id === currentStoreId) ?? memberships[0];
  if (!current) return <LogoTile />;
  const multi = memberships.length > 1;
  const inner = (
    <>
      <LogoTile />
      <span className="flex min-w-0 flex-col">
        <span className="text-[11px] uppercase tracking-[0.6px] text-on-navy-muted">
          {t("store_label") || "Store"}
        </span>
        <span
          className={cn(
            "flex min-w-0 items-center gap-1 font-bold",
            compact ? "text-sm" : "text-[15px]",
          )}
        >
          <span className="truncate">{current.store.name}</span>
          {multi && <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />}
        </span>
      </span>
    </>
  );
  if (!multi) {
    return <div className="flex min-h-11 min-w-0 items-center gap-2.5">{inner}</div>;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-tour="store-switcher"
          aria-label={t("switch_store") || "Switch store"}
          className="flex min-h-11 min-w-0 cursor-pointer items-center gap-2.5 text-left text-on-navy"
        >
          {inner}
        </button>
      </DropdownMenuTrigger>
      <StoreMenu memberships={memberships} currentStoreId={currentStoreId} onSelect={onSelect} />
    </DropdownMenu>
  );
}

function ProfileMenu() {
  const t = useAppT("app_common");
  const roleLabel = useRoleLabel();
  const navigate = useNavigate();
  const { currentRole } = useStore();
  const { resolved, setTheme } = useTheme();
  const { data: profile } = useUserProfile();
  const name = profile?.fullName || profile?.email || "";

  async function signOut() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      navigate({ to: "/auth" });
    } catch (error) {
      toast.error(getErrorMessage(error, t("sign_out_failed") || "Could not sign out, try again"));
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-tour="profile-menu"
          aria-label={t("profile_menu") || "Profile and settings"}
          className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-[10px] px-1.5 text-left hover:bg-navy-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-avatar text-xs font-bold text-avatar-foreground">
            {initialsOf(name) || "J"}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[13px] font-bold text-on-navy">{name}</span>
            {currentRole && (
              <span className="text-[11px] text-on-navy-muted">{roleLabel(currentRole)}</span>
            )}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-56">
        <DropdownMenuLabel className="truncate">{name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="min-h-11"
          onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}
        >
          {resolved === "dark" ? <Sun /> : <Moon />}
          {resolved === "dark"
            ? t("theme_light") || "Light theme"
            : t("theme_dark") || "Dark theme"}
        </DropdownMenuItem>
        <DropdownMenuItem className="min-h-11" onClick={() => navigate({ to: "/billing" })}>
          <Settings />
          {t("settings_billing") || "Settings and billing"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="min-h-11 text-destructive" onClick={signOut}>
          <LogOut />
          {t("sign_out") || "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const TABS = [
  { key: "home", to: "/dashboard", labelKey: "nav_home", fallback: "Home", icon: Home },
  { key: "orders", to: "/orders", labelKey: "nav_orders", fallback: "Orders", icon: Scissors },
  { key: "new" },
  { key: "clients", to: "/clients", labelKey: "nav_clients", fallback: "Clients", icon: Users },
  { key: "more", to: "/more", labelKey: "nav_more", fallback: "More", icon: Menu },
] as const;

function BottomBar({
  path,
  ordersBadge,
  onNew,
}: {
  path: string;
  ordersBadge: number;
  onNew: () => void;
}) {
  const t = useAppT("app_common");
  return (
    <nav
      data-tour="bottom-bar"
      aria-label={t("main_nav") || "Main"}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="mx-auto grid h-[84px] max-w-lg grid-cols-5 items-start px-1.5 pt-2">
        {TABS.map((tab) => {
          if (tab.key === "new") {
            return (
              <li key="new" className="flex justify-center">
                <button
                  type="button"
                  data-tour="new-order"
                  onClick={onNew}
                  aria-label={t("new_order") || "New order"}
                  className="-mt-[26px] flex size-[60px] cursor-pointer items-center justify-center rounded-[20px] border-4 border-background bg-navy text-gold-bright dark:bg-navy-raised shadow-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                >
                  <Plus className="size-[26px]" strokeWidth={2.6} aria-hidden="true" />
                </button>
              </li>
            );
          }
          const Icon = tab.icon;
          // Everything that isn't Home, Orders or Clients lives under More.
          const active =
            tab.key === "more"
              ? !["/dashboard", "/orders", "/clients"].some(
                  (p) => path === p || path.startsWith(`${p}/`),
                )
              : path === tab.to || path.startsWith(`${tab.to}/`);
          const badge = tab.key === "orders" ? ordersBadge : 0;
          return (
            <li key={tab.key}>
              <Link
                to={tab.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[52px] flex-col items-center gap-1 pt-1 text-[11px]",
                  active
                    ? "font-extrabold text-primary shadow-[inset_0_3px_0_var(--gold)]"
                    : "font-semibold text-tab-inactive",
                )}
              >
                <span className="relative flex">
                  <Icon className="size-[22px]" aria-hidden="true" />
                  {badge > 0 && (
                    <span className="num absolute -right-3 -top-1.5 rounded-full bg-count-badge px-[5px] text-[10px] leading-4 text-count-badge-foreground">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </span>
                <span>{t(tab.labelKey) || tab.fallback}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
