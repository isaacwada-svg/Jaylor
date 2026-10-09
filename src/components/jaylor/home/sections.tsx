import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { CalendarDays, Lock, Plus, UserPlus, Wallet, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { RemindButton } from "@/components/jaylor/remind-button";
import { useShellActions } from "@/components/jaylor/app-shell";
import { formatMoney } from "@/lib/jaylor";
import { useAppLanguage, useAppT } from "@/lib/i18n/i18n-context";
import { useOrderStatusLabel } from "@/lib/i18n/app-labels";
import { balanceDueMessageI18n, resolveMessageLanguage } from "@/lib/whatsapp-i18n";
import { useStore } from "@/lib/store-context";
import type {
  DueSoonItem,
  FittingItem,
  HomeDashboard,
  LowStockItem,
  MyJob,
  RecentPayment,
  WhoOwes,
} from "@/lib/home-dashboard";
import { cn, initialsOf } from "@/lib/utils";
import { daysBetween, formatShortDate, formatTime, pctChange, pointChange } from "./format";

export type Tone = "up" | "warn" | "down" | "info";

const CHIP: Record<Tone, string> = {
  up: "bg-chip-up text-chip-up-foreground",
  warn: "bg-chip-warn text-chip-warn-foreground",
  down: "bg-chip-down text-chip-down-foreground",
  info: "bg-chip-info text-chip-info-foreground",
};

/** Meaning-only status chip (fully rounded). */
export function Chip({
  tone,
  children,
  className,
}: {
  tone: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2 py-[3px] text-[11px] font-bold",
        CHIP[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Square-cornered tag for due dates in Needs attention. */
function Tag({ tone, children }: { tone: "down" | "warn"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "num shrink-0 whitespace-nowrap rounded-md px-2 py-1 text-xs !font-semibold",
        CHIP[tone],
      )}
    >
      {children}
    </span>
  );
}

export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn("font-display text-lg lg:text-[19px]", className)}>{children}</h2>;
}

type SectionPath = "/orders" | "/inventory" | "/payments" | "/consultations";

export function SectionLink({ to, children }: { to: SectionPath; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="flex min-h-11 items-center text-[13px] font-bold text-link hover:text-link-hover"
    >
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Figure cards
// ---------------------------------------------------------------------------

type Figure = {
  key: string;
  label: string;
  value: ReactNode;
  chip?: { tone: Tone; text: string } | null;
  sub?: ReactNode;
};

function useFigures(data: HomeDashboard, variant: "desktop" | "phone"): Figure[] {
  const t = useAppT("app_dashboard");
  const money = data.money;
  const work = data.work;

  const dueWeek: Figure = {
    key: "due",
    label: t("fig_due_week") || "Due this week",
    value: work.week_garments,
    chip:
      work.overdue_garments > 0
        ? {
            tone: "warn",
            text:
              t("chip_overdue", { count: work.overdue_garments }) ||
              `${work.overdue_garments} overdue`,
          }
        : null,
    sub:
      t("fig_due_week_sub", { count: work.today_garments }) ||
      `garments · ${work.today_garments} due today`,
  };

  if (!money) {
    // Tailor: their own jobs, no money.
    return [
      dueWeek,
      {
        key: "overdue",
        label: t("fig_overdue_jobs") || "Overdue",
        value: work.overdue_garments,
        sub: t("fig_garments") || "garments",
      },
      {
        key: "today",
        label: t("fig_due_today") || "Due today",
        value: work.today_garments,
        sub: t("fig_garments") || "garments",
      },
      {
        key: "active",
        label: t("fig_active_jobs") || "My active jobs",
        value: work.active_orders,
        sub: t("fig_in_progress") || "in progress",
      },
    ];
  }

  const todayDelta = pctChange(money.today.total, money.today.prev_total);
  const margin = money.margin;
  const marginDelta = margin ? pointChange(margin.pct, margin.prev_pct) : null;

  const marginFig: Figure = data.access.profit
    ? {
        key: "margin",
        label: t("fig_margin") || "Profit margin",
        value: margin?.pct === null || margin?.pct === undefined ? "–" : `${margin.pct}%`,
        chip: marginDelta
          ? { tone: marginDelta.tone === "down" ? "down" : "up", text: marginDelta.text }
          : null,
        sub: margin
          ? t("fig_margin_sub", { amount: formatMoney(margin.profit) }) ||
            `${formatMoney(margin.profit)} profit this month`
          : null,
      }
    : {
        key: "margin",
        label: t("fig_margin") || "Profit margin",
        value: (
          <Link
            to="/billing"
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-link hover:text-link-hover"
          >
            <Lock className="size-4" aria-hidden="true" />
            {t("upgrade_profit") || "Upgrade to see profit"}
          </Link>
        ),
        chip: { tone: "info", text: "Business" },
        sub: null,
      };

  const owed: Figure = {
    key: "owed",
    label:
      variant === "phone"
        ? t("fig_owed_phone") || "Owed to you"
        : t("fig_owed") || "Owed by clients",
    value: formatMoney(money.owed.total),
    chip:
      money.owed.overdue_clients > 0
        ? {
            tone: "down",
            text:
              t("chip_overdue", { count: money.owed.overdue_clients }) ||
              `${money.owed.overdue_clients} overdue`,
          }
        : null,
    sub:
      t("fig_owed_sub", { count: money.owed.clients }) ||
      `${money.owed.clients} clients with a balance`,
  };

  if (variant === "phone") {
    const avg = money.today.count > 0 ? Math.round(money.today.total / money.today.count) : 0;
    return [
      marginFig,
      owed,
      dueWeek,
      {
        key: "payments",
        label: t("fig_payments_today") || "Payments today",
        value: money.today.count,
        chip:
          money.today.count > 0
            ? {
                tone: "info",
                text: t("chip_avg", { amount: formatMoney(avg) }) || `Avg ${formatMoney(avg)}`,
              }
            : null,
      },
    ];
  }

  return [
    {
      key: "collected",
      label: t("collected_today") || "Collected today",
      value: formatMoney(money.today.total),
      chip: todayDelta
        ? { tone: todayDelta.tone === "down" ? "down" : "up", text: todayDelta.text }
        : null,
      sub: t("fig_collected_sub", { count: money.today.count }) || `${money.today.count} payments`,
    },
    marginFig,
    owed,
    dueWeek,
  ];
}

export function DesktopFigures({ data }: { data: HomeDashboard }) {
  const t = useAppT("app_dashboard");
  const figures = useFigures(data, "desktop");
  return (
    <section
      data-tour="figure-cards"
      aria-label={t("at_a_glance") || "Today at a glance"}
      className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4"
    >
      {figures.map((f) => (
        <div
          key={f.key}
          className="flex flex-col gap-2 rounded-[14px] border border-border bg-card px-[18px] py-4"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-semibold text-muted-foreground">{f.label}</span>
            {f.chip && <Chip tone={f.chip.tone}>{f.chip.text}</Chip>}
          </div>
          <span className="num text-[26px] leading-tight tracking-[-0.5px]">{f.value}</span>
          {f.sub && <span className="text-xs text-muted-foreground">{f.sub}</span>}
        </div>
      ))}
    </section>
  );
}

export function PhoneFigures({ data }: { data: HomeDashboard }) {
  const t = useAppT("app_dashboard");
  const figures = useFigures(data, "phone");
  return (
    <section
      data-tour="figure-cards"
      aria-label={t("at_a_glance") || "Today at a glance"}
      className="grid grid-cols-2 gap-2.5 p-4"
    >
      {figures.map((f) => (
        <div
          key={f.key}
          className="flex min-w-0 flex-col gap-1.5 rounded-[14px] border border-border bg-card p-3.5"
        >
          <span className="text-xs font-semibold text-muted-foreground">{f.label}</span>
          <span className="num truncate text-[22px] leading-tight tracking-[-0.4px]">
            {f.value}
          </span>
          {f.chip ? (
            <Chip tone={f.chip.tone} className="self-start">
              {f.chip.text}
            </Chip>
          ) : f.sub ? (
            <span className="truncate text-[11px] text-muted-foreground">{f.sub}</span>
          ) : null}
        </div>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Needs attention
// ---------------------------------------------------------------------------

function useDueRow() {
  const t = useAppT("app_dashboard");
  const statusLabel = useOrderStatusLabel();
  return (item: DueSoonItem) => {
    const garment =
      item.quantity > 1 ? `${item.garment_type} ×${item.quantity}` : item.garment_type;
    const name = item.client_name ? `${item.client_name} · ${garment}` : garment;
    const meta =
      item.balance !== null && item.balance > 0
        ? t("meta_balance", { amount: formatMoney(item.balance) }) ||
          `Balance ${formatMoney(item.balance)}`
        : t("meta_stage", { stage: statusLabel(item.status) }) ||
          `${statusLabel(item.status)} stage`;
    const d = item.days_left;
    const tag =
      d < 0
        ? {
            tone: "down" as const,
            text:
              t("tag_overdue_days", { count: Math.abs(d) }) ||
              `Overdue ${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"}`,
          }
        : d === 0
          ? { tone: "down" as const, text: t("tag_today") || "Today" }
          : d === 1
            ? { tone: "warn" as const, text: t("tag_tomorrow") || "Tomorrow" }
            : { tone: "warn" as const, text: t("tag_days", { count: d }) || `${d} days` };
    return { name, meta, tag };
  };
}

function AttentionRow({
  name,
  meta,
  tag,
  orderId,
}: {
  name: string;
  meta: string;
  tag: { tone: "down" | "warn"; text: string };
  orderId?: string;
}) {
  const linkProps = orderId
    ? ({ to: "/orders/$orderId", params: { orderId } } as const)
    : ({ to: "/inventory" } as const);
  return (
    <Link
      {...linkProps}
      className="flex items-center gap-2.5 border-b border-divider py-[11px] last:border-b-0 hover:bg-subtle"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold">{name}</span>
        <span className="truncate text-xs text-muted-foreground">{meta}</span>
      </span>
      <Tag tone={tag.tone}>{tag.text}</Tag>
    </Link>
  );
}

function lowStockRow(item: LowStockItem, t: ReturnType<typeof useAppT>) {
  const qty = Number(item.quantity);
  const reorder = Number(item.reorder_level);
  return {
    name: item.name,
    meta:
      t("meta_reorder_at", { count: reorder, unit: item.unit }) ||
      `Reorder at ${reorder} ${item.unit}`,
    tag: {
      tone: qty <= reorder / 2 ? ("down" as const) : ("warn" as const),
      text: t("tag_left", { count: qty, unit: item.unit }) || `${qty} ${item.unit} left`,
    },
  };
}

export function NeedsAttention({
  data,
  variant,
  onSendReminders,
}: {
  data: HomeDashboard;
  variant: "desktop" | "phone";
  onSendReminders: () => void;
}) {
  const t = useAppT("app_dashboard");
  const dueRow = useDueRow();
  const { currentStore } = useStore();
  const [tab, setTab] = useState<"due" | "stock">("due");
  const stock = data.low_stock;
  const showStockTab = variant === "desktop" && !!stock;
  const items = data.work.due_soon.slice(0, variant === "phone" ? 3 : 5);
  const canRemind = !!data.money && data.money.who_owes.length > 0;

  function sharePurchaseList() {
    if (!stock) return;
    const lines = stock.items.map((i) => {
      const need = Math.max(0, Number(i.reorder_level) * 2 - Number(i.quantity));
      return `• ${i.name}: ${need} ${i.unit} (${t("have_count", { count: Number(i.quantity), unit: i.unit }) || `have ${i.quantity} ${i.unit}`})`;
    });
    const text = [
      t("purchase_list_title", { store: currentStore?.name ?? "" }) ||
        `Purchase list, ${currentStore?.name ?? ""}`,
      ...lines,
    ].join("\n");
    if (navigator.share) {
      navigator.share({ text }).catch(() => {});
      return;
    }
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success(t("purchase_list_copied") || "Purchase list copied"))
      .catch(() => toast.error(t("purchase_list_failed") || "Could not copy the list"));
  }

  const isStock = tab === "stock" && showStockTab;
  const empty = isStock ? (stock?.items.length ?? 0) === 0 : items.length === 0;

  return (
    <section
      data-tour="needs-attention"
      aria-label={t("needs_attention") || "Needs attention"}
      className={cn(
        "flex min-w-0 flex-col rounded-2xl border border-border bg-card",
        variant === "desktop" ? "flex-[1_1_340px] gap-3 p-5" : "mx-4 mb-4 gap-2.5 p-4",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <SectionTitle>{t("needs_attention") || "Needs attention"}</SectionTitle>
        <SectionLink to={isStock ? "/inventory" : "/orders"}>
          {variant === "phone"
            ? t("see_all") || "See all"
            : isStock
              ? t("all_inventory") || "All inventory"
              : t("all_orders") || "All orders"}
        </SectionLink>
      </div>
      {showStockTab && (
        <TabsLike
          value={tab}
          onChange={setTab}
          label={t("attention_type") || "Attention type"}
          options={[
            {
              value: "due",
              label: `${t("tab_due_soon") || "Due soon"} · ${data.work.due_soon_count}`,
            },
            {
              value: "stock",
              label: `${t("tab_low_stock") || "Low stock"} · ${stock?.count ?? 0}`,
            },
          ]}
        />
      )}
      <div className="flex flex-1 flex-col" role={showStockTab ? "tabpanel" : undefined}>
        {empty ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {isStock
              ? t("empty_low_stock") || "Nothing is running low."
              : t("empty_due_soon") || "Nothing is due in the next 3 days."}
          </p>
        ) : isStock ? (
          stock!.items.map((i) => <AttentionRow key={i.id} {...lowStockRow(i, t)} />)
        ) : (
          items.map((i) => <AttentionRow key={i.order_id} orderId={i.order_id} {...dueRow(i)} />)
        )}
      </div>
      {isStock ? (
        stock && stock.items.length > 0 ? (
          <Button variant="outline" className="h-[46px]" onClick={sharePurchaseList}>
            {t("create_purchase_list") || "Create purchase list"}
          </Button>
        ) : null
      ) : canRemind ? (
        <Button
          variant={variant === "phone" ? "default" : "outline"}
          className={variant === "phone" ? "h-12" : "h-[46px]"}
          onClick={onSendReminders}
        >
          {t("send_reminders") || "Send reminders"}
        </Button>
      ) : null}
    </section>
  );
}

function TabsLike<T extends string>({
  value,
  onChange,
  label,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  label: string;
  options: { value: T; label: string }[];
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 rounded-[10px] bg-divider p-1">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "num min-h-9 flex-1 cursor-pointer whitespace-nowrap rounded-lg px-3 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              on
                ? "bg-card text-foreground shadow-segment"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Who owes you (+ the reminders sheet)
// ---------------------------------------------------------------------------

function useOwesLine() {
  const t = useAppT("app_dashboard");
  const lang = useAppLanguage();
  return (w: WhoOwes, today: string) => {
    if (!w.earliest_due) return { text: t("no_due_date") || "No due date", overdue: false };
    const days = daysBetween(w.earliest_due, today);
    if (days > 0) {
      return {
        text:
          t("owes_overdue_days", { count: days }) || `Overdue ${days} day${days === 1 ? "" : "s"}`,
        overdue: true,
      };
    }
    if (days === 0) return { text: t("owes_due_today") || "Due today", overdue: true };
    const date = formatShortDate(w.earliest_due, lang);
    return { text: t("owes_due_on", { date }) || `Due ${date}`, overdue: false };
  };
}

function OwesRow({ w, today }: { w: WhoOwes; today: string }) {
  const t = useAppT("app_dashboard");
  const owesLine = useOwesLine();
  const { currentStore } = useStore();
  const line = owesLine(w, today);
  const trackingUrl = w.tracking_token ? `${window.location.origin}/t/${w.tracking_token}` : null;
  return (
    <div className="flex items-center gap-2.5 border-t border-divider py-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-avatar text-xs font-bold text-avatar-foreground">
        {initialsOf(w.client_name)}
      </span>
      <Link
        to="/clients/$clientId"
        params={{ clientId: w.client_id }}
        className="flex min-w-0 flex-1 flex-col"
      >
        <span className="truncate text-sm font-semibold">{w.client_name}</span>
        <span
          className={cn(
            "truncate text-xs font-semibold",
            line.overdue ? "text-chip-down-foreground" : "text-muted-foreground",
          )}
        >
          {line.text} · <span className="num">{formatMoney(w.balance)}</span>
        </span>
      </Link>
      {currentStore && (
        <RemindButton
          iconOnly
          storeId={currentStore.id}
          clientId={w.client_id}
          {...(w.order_id ? { orderId: w.order_id } : {})}
          phone={w.whatsapp_phone ?? w.phone}
          consentWhatsapp={w.consent_whatsapp}
          template="balance_due"
          message={balanceDueMessageI18n(
            resolveMessageLanguage(w.preferred_language, currentStore.language),
            w.client_name,
            w.garment_type ?? "",
            currentStore.name,
            w.balance,
            trackingUrl,
          )}
          label={
            t("remind_whatsapp", { name: w.client_name }) ||
            `Send ${w.client_name} a reminder on WhatsApp`
          }
        />
      )}
    </div>
  );
}

export function WhoOwesYou({ data }: { data: HomeDashboard }) {
  const t = useAppT("app_dashboard");
  if (!data.money) return null;
  const list = data.money.who_owes;
  return (
    <section
      data-tour="who-owes"
      aria-label={t("who_owes") || "Who owes you"}
      className="mx-4 mb-6 rounded-2xl border border-border bg-card px-4 pb-2 pt-1.5"
    >
      <div className="flex items-center justify-between">
        <SectionTitle>{t("who_owes") || "Who owes you"}</SectionTitle>
        <span className="num flex min-h-11 items-center text-[13px] text-chip-down-foreground">
          {formatMoney(data.money.owed.total)}
        </span>
      </div>
      {list.length === 0 ? (
        <p className="border-t border-divider py-5 text-center text-sm text-muted-foreground">
          {t("empty_who_owes") || "Nobody owes you right now."}
        </p>
      ) : (
        list.map((w) => <OwesRow key={w.client_id} w={w} today={data.today} />)
      )}
    </section>
  );
}

export function RemindersSheet({
  data,
  open,
  onOpenChange,
}: {
  data: HomeDashboard;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useAppT("app_dashboard");
  const list = data.money?.who_owes ?? [];
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[85vh] overflow-y-auto rounded-t-2xl sm:mx-auto sm:max-w-lg"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="text-xl">{t("send_reminders") || "Send reminders"}</SheetTitle>
          <p className="text-sm text-muted-foreground">
            {t("reminders_hint") || "Tap WhatsApp to send each client their balance reminder."}
          </p>
        </SheetHeader>
        <div className="px-4 pb-4">
          {list.map((w) => (
            <OwesRow key={w.client_id} w={w} today={data.today} />
          ))}
          <Link
            to="/orders"
            onClick={() => onOpenChange(false)}
            className="mt-2 flex min-h-11 items-center justify-center text-[13px] font-bold text-link hover:text-link-hover"
          >
            {t("all_orders") || "All orders"}
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Recent payments
// ---------------------------------------------------------------------------

function PaymentPill({ p }: { p: RecentPayment }) {
  const t = useAppT("app_dashboard");
  if (p.voided) return <Chip tone="info">{t("pill_voided") || "Voided"}</Chip>;
  if (p.order_balance !== null && p.order_balance > 0) {
    return <Chip tone="warn">{t("pill_part_paid") || "Part paid"}</Chip>;
  }
  return <Chip tone="up">{t("pill_paid") || "Paid"}</Chip>;
}

export function RecentPayments({ data }: { data: HomeDashboard }) {
  const t = useAppT("app_dashboard");
  if (!data.money) return null;
  const rows = data.money.recent_payments;
  return (
    <section
      aria-label={t("recent_payments") || "Recent payments"}
      className="min-w-0 flex-[999_1_560px] rounded-2xl border border-border bg-card px-5 pb-3 pt-2"
    >
      <div className="flex items-center justify-between">
        <SectionTitle>{t("recent_payments") || "Recent payments"}</SectionTitle>
        <SectionLink to="/payments">{t("all_payments") || "All payments"}</SectionLink>
      </div>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t("empty_payments") || "No payments yet. Record your first one from an order."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.5px] text-muted-foreground">
                <th scope="col" className="py-2.5 pr-2 font-bold">
                  {t("col_receipt") || "Receipt"}
                </th>
                <th scope="col" className="px-2 py-2.5 font-bold">
                  {t("col_client") || "Client"}
                </th>
                <th scope="col" className="px-2 py-2.5 font-bold">
                  {t("col_order") || "Order"}
                </th>
                <th scope="col" className="px-2 py-2.5 text-right font-bold">
                  {t("col_amount") || "Amount"}
                </th>
                <th scope="col" className="py-2.5 pl-2 font-bold">
                  {t("col_status") || "Status"}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const garment =
                  p.garment_type && p.quantity && p.quantity > 1
                    ? `${p.garment_type} ×${p.quantity}`
                    : (p.garment_type ?? "");
                return (
                  <tr key={p.id} className="border-t border-divider">
                    <td className="py-3 pr-2">
                      <span className="num block text-xs">
                        #{p.reference || p.id.slice(0, 6).toUpperCase()}
                      </span>
                      <span className="num text-[11px] !font-semibold text-muted-foreground">
                        {formatTime(p.paid_at, data.timezone)}
                      </span>
                    </td>
                    <td className="px-2 py-3 font-bold">{p.client_name ?? ""}</td>
                    <td className="px-2 py-3 text-muted-foreground">
                      {p.order_id ? (
                        <Link
                          to="/orders/$orderId"
                          params={{ orderId: p.order_id }}
                          className="hover:text-link-hover"
                        >
                          {garment || p.order_number}
                        </Link>
                      ) : null}
                    </td>
                    <td
                      className={cn(
                        "num px-2 py-3 text-right",
                        p.voided && "text-muted-foreground line-through",
                      )}
                    >
                      {formatMoney(p.amount, p.currency)}
                    </td>
                    <td className="py-3 pl-2">
                      <PaymentPill p={p} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Fittings today
// ---------------------------------------------------------------------------

function useFittingTitle() {
  const t = useAppT("app_dashboard");
  return (f: FittingItem) => {
    const kind =
      f.purpose === "final_fitting"
        ? t("fitting_final") || "Final fitting"
        : f.purpose === "fitting"
          ? t("fitting_fitting") || "Fitting"
          : f.purpose === "pickup"
            ? t("fitting_pickup") || "Pickup"
            : t("fitting_consultation") || "Consultation";
    return f.garment_type ? `${f.garment_type} · ${kind}` : kind;
  };
}

export function FittingsToday({ data }: { data: HomeDashboard }) {
  const t = useAppT("app_dashboard");
  const title = useFittingTitle();
  const header = (
    <div className="flex items-center justify-between">
      <SectionTitle>{t("fittings_today") || "Fittings today"}</SectionTitle>
      {data.access.fittings && (
        <SectionLink to="/consultations">{t("book_fitting") || "Book fitting"}</SectionLink>
      )}
    </div>
  );
  const shell =
    "flex min-w-0 flex-[1_1_340px] flex-col gap-2.5 rounded-2xl border border-border bg-card px-5 pb-5 pt-2";

  if (!data.access.fittings || !data.fittings) {
    return (
      <section aria-label={t("fittings_today") || "Fittings today"} className={shell}>
        {header}
        <div className="flex flex-1 flex-col items-start justify-center gap-3 rounded-xl border border-highlight-border bg-highlight p-4">
          <p className="text-sm font-semibold">
            {t("fittings_upgrade") ||
              "See today's fittings and let clients book themselves with Growth."}
          </p>
          <Button asChild variant="outline">
            <Link to="/billing">
              <Lock className="size-4" aria-hidden="true" />
              {t("upgrade_growth") || "Upgrade to Growth"}
            </Link>
          </Button>
        </div>
      </section>
    );
  }

  const now = Date.now();
  const nextId = data.fittings.items.find((f) => new Date(f.starts_at).getTime() >= now)?.id;
  return (
    <section aria-label={t("fittings_today") || "Fittings today"} className={shell}>
      {header}
      {data.fittings.items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t("empty_fittings") || "No fittings booked for today."}
        </p>
      ) : (
        data.fittings.items.map((f) => {
          const next = f.id === nextId;
          return (
            <div key={f.id} className="flex items-stretch gap-3.5">
              <span className="num w-11 shrink-0 pt-3 text-xs !font-semibold text-muted-foreground">
                {formatTime(f.starts_at, data.timezone)}
              </span>
              <Link
                {...(f.order_id
                  ? ({ to: "/orders/$orderId", params: { orderId: f.order_id } } as const)
                  : ({ to: "/consultations" } as const))}
                className={cn(
                  "flex min-w-0 flex-1 flex-col gap-1 rounded-xl border px-3.5 py-3",
                  next ? "border-highlight-border bg-highlight" : "border-border bg-subtle",
                )}
              >
                <span className="truncate text-sm font-bold">{title(f)}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {f.client_name ?? ""}
                  {next ? ` · ${t("fitting_next") || "Next"}` : ""}
                </span>
              </Link>
            </div>
          );
        })
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Phone quick actions, tailor job list, offline notice
// ---------------------------------------------------------------------------

export function QuickActions({ data }: { data: HomeDashboard | undefined }) {
  const t = useAppT("app_dashboard");
  const tc = useAppT("app_common");
  const actions = useShellActions();
  const tile = "flex size-14 items-center justify-center rounded-2xl";
  const items = [
    ...(actions.canManageOrders
      ? [
          {
            key: "new-order",
            label: tc("new_order") || "New order",
            icon: Plus,
            onClick: actions.openNewOrder,
            filled: true,
          },
          {
            key: "record-payment",
            label: tc("record_payment") || "Record payment",
            icon: Wallet,
            onClick: actions.recordPayment,
          },
        ]
      : []),
    {
      key: "add-client",
      label: t("add_client") || "Add client",
      icon: UserPlus,
      onClick: actions.openNewClient,
    },
    ...(data?.access.fittings !== false
      ? [
          {
            key: "book-fitting",
            label: t("book_fitting") || "Book fitting",
            icon: CalendarDays,
            onClick: actions.bookFitting,
          },
        ]
      : []),
  ];
  return (
    <div className="grid grid-cols-4 gap-2 px-4 pb-1 pt-[18px]">
      {items.map(({ key, label, icon: Icon, onClick, filled }) => (
        <button
          key={key}
          type="button"
          data-tour={key === "new-order" || key === "record-payment" ? key : undefined}
          onClick={onClick}
          className="flex cursor-pointer flex-col items-center gap-2 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span
            className={cn(
              tile,
              filled
                ? "bg-navy text-gold-bright dark:bg-navy-raised"
                : "border border-outline bg-card text-primary",
            )}
          >
            <Icon className="size-[22px]" strokeWidth={filled ? 2.6 : 2} aria-hidden="true" />
          </span>
          <span className="text-center text-xs font-semibold leading-tight">{label}</span>
        </button>
      ))}
    </div>
  );
}

export function MyJobs({ jobs, className }: { jobs: MyJob[]; className?: string }) {
  const t = useAppT("app_dashboard");
  const statusLabel = useOrderStatusLabel();
  const lang = useAppLanguage();
  return (
    <section
      aria-label={t("my_jobs_title") || "My jobs"}
      className={cn("rounded-2xl border border-border bg-card px-4 pb-2 pt-1.5 lg:px-5", className)}
    >
      <div className="flex items-center justify-between">
        <SectionTitle>{t("my_jobs_title") || "My jobs"}</SectionTitle>
        <SectionLink to="/orders">{t("see_all") || "See all"}</SectionLink>
      </div>
      {jobs.length === 0 ? (
        <p className="border-t border-divider py-6 text-center text-sm text-muted-foreground">
          {t("empty_jobs_description") ||
            "Orders assigned to you will show up here, soonest due first."}
        </p>
      ) : (
        jobs.map((j) => (
          <Link
            key={j.order_id}
            to="/orders/$orderId"
            params={{ orderId: j.order_id }}
            className="flex items-center gap-2.5 border-t border-divider py-2.5 hover:bg-subtle"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm font-semibold">
                {j.quantity > 1 ? `${j.garment_type} ×${j.quantity}` : j.garment_type}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {statusLabel(j.status)}
              </span>
            </span>
            {j.delivery_date && (
              <span className="num shrink-0 text-xs text-muted-foreground">
                {formatShortDate(j.delivery_date, lang)}
              </span>
            )}
          </Link>
        ))
      )}
    </section>
  );
}

export function OfflineNotice({ generatedAt, onDark }: { generatedAt: string; onDark?: boolean }) {
  const t = useAppT("app_dashboard");
  const time = new Date(generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <p
      role="status"
      className={cn(
        "inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-1 text-xs font-semibold",
        onDark ? "bg-navy-raised text-on-navy" : "bg-chip-warn text-chip-warn-foreground",
      )}
    >
      <WifiOff className="size-3.5" aria-hidden="true" />
      {t("offline_last_update", { time }) || `Offline, showing last update (${time})`}
    </p>
  );
}
