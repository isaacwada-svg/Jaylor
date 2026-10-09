import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Plus, Search } from "lucide-react";
import { AppShell, MobileStoreSwitcher, useShellActions } from "@/components/jaylor/app-shell";
import { NotificationBell } from "@/components/jaylor/notification-bell";
import { SearchPanel } from "@/components/jaylor/global-search";
import { MilestoneCelebration } from "@/components/jaylor/milestone-celebration";
import { DailyWorkPlan } from "@/components/jaylor/daily-work-plan";
import { ComingUpCard } from "@/components/jaylor/coming-up-card";
import { MomentsSection } from "@/components/jaylor/moments-section";
import { OnTimeScoreCard } from "@/components/jaylor/on-time-score-card";
import { CapacityLoadChart } from "@/components/jaylor/capacity-load-chart";
import { CollectionsCard, HeroCollections } from "@/components/jaylor/home/collections";
import {
  DesktopFigures,
  FittingsToday,
  MyJobs,
  NeedsAttention,
  OfflineNotice,
  PhoneFigures,
  QuickActions,
  RecentPayments,
  RemindersSheet,
  WhoOwesYou,
} from "@/components/jaylor/home/sections";
import { formatLongDate } from "@/components/jaylor/home/format";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useStore } from "@/lib/store-context";
import { supabase } from "@/integrations/supabase/client";
import { WHATSAPP_AUTO_TOPUP_ENABLED } from "@/lib/jaylor";
import { useAppLanguage, useAppT } from "@/lib/i18n/i18n-context";
import { useFeature } from "@/lib/use-feature";
import { useMessageTopups } from "@/lib/use-message-topups";
import { useHomeDashboard, type HomeDashboard } from "@/lib/home-dashboard";

export const Route = createFileRoute("/_authenticated/dashboard")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Home · Jaylor" },
      {
        name: "description",
        content:
          "Jaylor tracks every order, measurement and payment for tailors and fashion houses, and reminds clients on WhatsApp so you get paid on time.",
      },
    ],
  }),
  component: Home,
});

function useFirstName() {
  const { data } = useQuery({
    queryKey: ["my-auth-user"],
    staleTime: Infinity,
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      const fullName =
        (data.user?.user_metadata as { full_name?: string } | undefined)?.full_name?.trim() ?? "";
      return { fullName, email: data.user?.email ?? "" };
    },
  });
  return data?.fullName.split(/\s+/)[0] || null;
}

function greetingKey(): "greeting_morning" | "greeting_afternoon" | "greeting_evening" {
  const hour = new Date().getHours();
  if (hour < 12) return "greeting_morning";
  if (hour < 17) return "greeting_afternoon";
  return "greeting_evening";
}

const GREETING_FALLBACK = {
  greeting_morning: "Good morning",
  greeting_afternoon: "Good afternoon",
  greeting_evening: "Good evening",
} as const;

function trialDaysLeft(trialEndsAt: string): number {
  return Math.max(
    0,
    Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
  );
}

function Home() {
  return (
    <AppShell mobileHeader="none">
      <HomeContent />
    </AppShell>
  );
}

function HomeContent() {
  const t = useAppT("app_dashboard");
  const lang = useAppLanguage();
  const { currentStore } = useStore();
  const storeId = currentStore?.id;
  const firstName = useFirstName();
  const dashboard = useHomeDashboard(storeId);
  const data = dashboard.data;
  const [remindersOpen, setRemindersOpen] = useState(false);

  const key = greetingKey();
  const greeting = `${t(key) || GREETING_FALLBACK[key]}${firstName ? `, ${firstName}` : ""}`;
  const now = new Date();
  const offline = !dashboard.online || dashboard.showingCached;

  return (
    <>
      {/* ---------------- Phone (below 1024px) ---------------- */}
      <div className="lg:hidden">
        <PhoneHeader
          greeting={greeting}
          date={formatLongDate(now, lang, false)}
          offlineAt={offline && data ? data.generated_at : null}
        />
        {data ? (
          data.money ? (
            <HeroCollections money={data.money} timeZone={data.timezone} />
          ) : (
            <TailorHero data={data} />
          )
        ) : (
          <Skeleton className="relative mx-4 -mt-16 h-52 rounded-[18px]" />
        )}
        <QuickActions data={data} />
        <HomeNotices />
        {data ? (
          <>
            <PhoneFigures data={data} />
            <NeedsAttention
              data={data}
              variant="phone"
              onSendReminders={() => setRemindersOpen(true)}
            />
            {data.money ? (
              <WhoOwesYou data={data} />
            ) : (
              <MyJobs jobs={data.my_jobs ?? []} className="mx-4 mb-6" />
            )}
          </>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-[14px]" />
            ))}
          </div>
        )}
        <div className="px-4">
          <MoreForToday />
        </div>
      </div>

      {/* ---------------- Desktop (1024px and up) ---------------- */}
      <div className="hidden flex-col gap-5 px-8 pb-10 pt-7 lg:flex">
        <DesktopHeader greeting={greeting} date={formatLongDate(now, lang, true)} />
        {offline && data && <OfflineNotice generatedAt={data.generated_at} />}
        <HomeNotices />
        {data ? (
          <>
            <DesktopFigures data={data} />
            <div className="flex flex-wrap gap-5">
              {data.money ? (
                <CollectionsCard money={data.money} timeZone={data.timezone} />
              ) : (
                <MyJobs jobs={data.my_jobs ?? []} className="min-w-0 flex-[999_1_560px]" />
              )}
              <NeedsAttention
                data={data}
                variant="desktop"
                onSendReminders={() => setRemindersOpen(true)}
              />
            </div>
            <div className="flex flex-wrap gap-5">
              <RecentPayments data={data} />
              <FittingsToday data={data} />
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-[120px] rounded-[14px]" />
              ))}
            </div>
            <Skeleton className="h-[420px] rounded-2xl" />
          </>
        )}
        <MoreForToday />
      </div>

      {data && <RemindersSheet data={data} open={remindersOpen} onOpenChange={setRemindersOpen} />}
      <MilestoneCelebration storeId={storeId} />
    </>
  );
}

function PhoneHeader({
  greeting,
  date,
  offlineAt,
}: {
  greeting: string;
  date: string;
  offlineAt: string | null;
}) {
  const tc = useAppT("app_common");
  const { memberships, currentStore, currentRole, setCurrentStoreId } = useStore();
  const actions = useShellActions();
  const canSeeBell = currentRole === "owner" || currentRole === "manager";
  return (
    <header className="flex flex-col gap-[18px] bg-navy px-5 pb-[84px] pt-[max(52px,calc(env(safe-area-inset-top)+16px))] text-on-navy">
      <div className="flex items-center justify-between gap-3">
        <MobileStoreSwitcher
          memberships={memberships}
          currentStoreId={currentStore?.id}
          onSelect={setCurrentStoreId}
        />
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={actions.openSearch}
            aria-label={tc("search_aria") || "Search orders and clients"}
            className="flex size-11 cursor-pointer items-center justify-center rounded-xl bg-navy-raised text-on-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            <Search className="size-5" aria-hidden="true" />
          </button>
          {currentStore && canSeeBell && <NotificationBell storeId={currentStore.id} tone="dark" />}
        </div>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] text-on-navy-muted">{date}</span>
        <h1 className="font-display text-[27px] leading-tight">{greeting}</h1>
      </div>
      {offlineAt && <OfflineNotice generatedAt={offlineAt} onDark />}
    </header>
  );
}

function DesktopHeader({ greeting, date }: { greeting: string; date: string }) {
  const tc = useAppT("app_common");
  const { currentStore, currentRole } = useStore();
  const actions = useShellActions();
  const canManage = currentRole === "owner" || currentRole === "manager";
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-[13px] text-muted-foreground">{date}</span>
        <h1 className="font-display text-[30px] leading-tight tracking-[-0.2px]">{greeting}</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <SearchPanel storeId={currentStore?.id} variant="inline" className="w-[280px] max-w-full" />
        {currentStore && canManage && <NotificationBell storeId={currentStore.id} tone="light" />}
        {canManage && (
          <Button variant="outline" data-tour="record-payment" onClick={actions.recordPayment}>
            {tc("record_payment") || "Record payment"}
          </Button>
        )}
        <Button data-tour="new-order" onClick={actions.openNewOrder} className="px-[18px]">
          <Plus className="size-[18px]" strokeWidth={2.6} aria-hidden="true" />
          {canManage ? tc("new_order") || "New order" : tc("new_button") || "New"}
        </Button>
      </div>
    </header>
  );
}

/** Tailors see no money: the phone hero becomes their own jobs due. */
function TailorHero({ data }: { data: HomeDashboard }) {
  const t = useAppT("app_dashboard");
  return (
    <section
      aria-label={t("my_jobs_title") || "My jobs"}
      className="relative mx-4 -mt-16 flex flex-col gap-1 rounded-[18px] bg-card p-[18px] shadow-hero"
    >
      <span className="text-[13px] font-semibold text-muted-foreground">
        {t("fig_due_week") || "Due this week"}
      </span>
      <span className="num text-[30px] leading-tight tracking-[-0.6px]">
        {data.work.week_garments}
      </span>
      <span className="text-[13px] font-semibold text-muted-foreground">
        {t("fig_due_week_sub", { count: data.work.today_garments }) ||
          `garments · ${data.work.today_garments} due today`}
      </span>
    </section>
  );
}

/** Trial and message-allowance notices, kept from the previous Home. */
function HomeNotices() {
  const t = useAppT("app_dashboard");
  const { currentStore, currentRole } = useStore();
  const storeId = currentStore?.id;
  const canSeeMoney = currentRole === "owner" || currentRole === "manager";
  const { data: messagesFeature } = useFeature(storeId, "whatsapp_auto");
  const { data: messageTopups } = useMessageTopups(storeId);
  const messagesLimit =
    typeof messagesFeature?.limit === "number"
      ? messagesFeature.limit + (messageTopups ?? 0)
      : null;
  const ratio =
    messagesLimit && messagesLimit > 0 ? (messagesFeature?.used ?? 0) / messagesLimit : 0;
  const onTrial = !!currentStore && new Date(currentStore.trial_ends_at) > new Date();
  if (!canSeeMoney || (!onTrial && ratio < 0.8)) return null;
  return (
    <div className="flex flex-col gap-3 px-4 pt-4 lg:px-0 lg:pt-0">
      {onTrial && currentStore && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-highlight-border bg-highlight px-4 py-3">
          <p className="text-sm">
            <span className="font-bold text-gold-ink">
              {t("trial_days_left", { count: trialDaysLeft(currentStore.trial_ends_at) }) ||
                `${trialDaysLeft(currentStore.trial_ends_at)} days left`}
            </span>{" "}
            {t("trial_banner_suffix") || "on your Growth trial."}
          </p>
          <Button size="sm" variant="outline" asChild>
            <Link to="/billing">{t("upgrade_now") || "Upgrade now"}</Link>
          </Button>
        </div>
      )}
      {ratio >= 0.8 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-chip-warn px-4 py-3 text-chip-warn-foreground">
          <p className="text-sm">
            {t("messages_running_low", {
              used: messagesFeature?.used ?? 0,
              limit: messagesLimit ?? 0,
            }) ||
              `You've used ${messagesFeature?.used} of ${messagesLimit} automatic WhatsApp messages this month. Tap-to-send stays free and unlimited either way.`}
          </p>
          {WHATSAPP_AUTO_TOPUP_ENABLED && (
            <Button size="sm" variant="outline" asChild>
              <Link to="/billing">{t("top_up_messages") || "Top up messages"}</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** The previous Home's planning cards, folded away below the approved
 *  layout so nothing that used to be on Home is lost. */
function MoreForToday() {
  const t = useAppT("app_dashboard");
  const { currentStore, currentRole } = useStore();
  const storeId = currentStore?.id;
  const canSeeMoney = currentRole === "owner" || currentRole === "manager";
  const [open, setOpen] = useState(false);
  const { data: onTimeBadgeFeature } = useFeature(storeId, "on_time_badge");
  const { data: capacityFeature } = useFeature(storeId, "capacity_planning");
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mb-6">
      <CollapsibleTrigger asChild>
        <Button variant="outline" className="w-full justify-between">
          {t("more_for_today") || "Work plan, moments and scores"}
          <ChevronDown
            className={open ? "rotate-180 transition-transform" : "transition-transform"}
            aria-hidden="true"
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-4 flex flex-col gap-4">
        {open && (
          <>
            <ComingUpCard storeId={storeId} />
            <DailyWorkPlan storeId={storeId} />
            {canSeeMoney && <MomentsSection storeId={storeId} />}
            {canSeeMoney &&
              storeId &&
              (onTimeBadgeFeature?.allowed || capacityFeature?.allowed) && (
                <div className="grid gap-4 lg:grid-cols-2">
                  {onTimeBadgeFeature?.allowed && <OnTimeScoreCard storeId={storeId} />}
                  {capacityFeature?.allowed && <CapacityLoadChart storeId={storeId} />}
                </div>
              )}
          </>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
