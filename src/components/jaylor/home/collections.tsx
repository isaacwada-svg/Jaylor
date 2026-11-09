import { useState } from "react";
import { formatMoney } from "@/lib/jaylor";
import { useAppLanguage, useAppT } from "@/lib/i18n/i18n-context";
import type { HomeMoney } from "@/lib/home-dashboard";
import { cn } from "@/lib/utils";
import {
  buildBars,
  compactNaira,
  methodSplit,
  pctChange,
  periodTotals,
  weekdayName,
  type MethodKey,
  type Period,
} from "./format";

const PERIODS: Period[] = ["today", "7d", "30d"];

const METHOD_COLOR: Record<MethodKey, string> = {
  transfer: "bg-pay-transfer",
  cash: "bg-pay-cash",
  paystack: "bg-pay-jaylor",
  pos: "bg-pay-pos",
  other: "bg-pay-other",
};

/** VetX segmented control: 10px track, 8px buttons, white active pill. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  role = "group",
  className,
  stretch,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  role?: "group" | "tablist";
  className?: string;
  stretch?: boolean;
}) {
  return (
    <div
      role={role}
      aria-label={label}
      className={cn("flex gap-1 rounded-[10px] bg-divider p-1", className)}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            {...(role === "tablist"
              ? { role: "tab", "aria-selected": on }
              : { "aria-pressed": on })}
            onClick={() => onChange(o.value)}
            className={cn(
              "min-h-9 cursor-pointer whitespace-nowrap rounded-lg px-3.5 text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              stretch && "flex-1",
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

function usePeriodCopy() {
  const t = useAppT("app_dashboard");
  const lang = useAppLanguage();
  return {
    t,
    lang,
    periodLabel: (p: Period) =>
      p === "today"
        ? t("period_today") || "Today"
        : p === "7d"
          ? t("period_7d") || "7 days"
          : t("period_30d") || "30 days",
    title: (p: Period) =>
      p === "today"
        ? t("collected_today") || "Collected today"
        : p === "7d"
          ? t("collected_7d") || "Collected, last 7 days"
          : t("collected_30d") || "Collected, last 30 days",
    versus: (p: Period) => {
      if (p === "today") {
        const lastWeek = new Date();
        lastWeek.setDate(lastWeek.getDate() - 7);
        const day = weekdayName(lastWeek, lang);
        return t("vs_last_weekday", { day }) || `vs last ${day}`;
      }
      return p === "7d"
        ? t("vs_prior_7d") || "vs prior 7 days"
        : t("vs_prior_30d") || "vs prior 30 days";
    },
    methodLabel: (k: MethodKey) =>
      ({
        transfer: t("method_transfer") || "Transfer",
        cash: t("method_cash") || "Cash",
        paystack: t("method_jaylor_pay") || "Jaylor Pay",
        pos: "POS",
        other: t("method_other") || "Other",
      })[k],
  };
}

function DeltaLine({ money, period }: { money: HomeMoney; period: Period }) {
  const copy = usePeriodCopy();
  const { total, prev } = periodTotals(money, period);
  const delta = pctChange(total, prev);
  if (!delta) {
    return (
      <span className="text-[13px] font-semibold text-muted-foreground">
        {copy.t("no_comparison") || "Nothing to compare yet"}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "text-[13px] font-bold",
        delta.tone === "up" && "text-chip-up-foreground",
        delta.tone === "down" && "text-chip-down-foreground",
        delta.tone === "flat" && "text-muted-foreground",
      )}
    >
      {delta.text} {copy.versus(period)}
    </span>
  );
}

export function PaySplit({
  money,
  period,
  size = "md",
}: {
  money: HomeMoney;
  period: Period;
  size?: "sm" | "md";
}) {
  const copy = usePeriodCopy();
  const split = methodSplit(periodTotals(money, period).methods);
  if (split.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {copy.t("no_payments_period") || "No payments in this period yet."}
      </p>
    );
  }
  const summary = split.map((s) => `${copy.methodLabel(s.key)} ${s.pct}%`).join(", ");
  return (
    <div className="flex flex-col gap-2">
      <div
        role="img"
        aria-label={summary}
        className={cn("flex gap-0.5 overflow-hidden rounded-full", size === "sm" ? "h-2" : "h-2.5")}
      >
        {split.map((s) => (
          <div
            key={s.key}
            className={METHOD_COLOR[s.key]}
            style={{ flex: `${Math.max(s.pct, 1)} 1 0` }}
          />
        ))}
      </div>
      <div
        className={cn(
          "flex flex-wrap",
          size === "sm" ? "gap-x-3.5 gap-y-1.5" : "gap-x-[18px] gap-y-1.5",
        )}
      >
        {split.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-xs">
            <span
              aria-hidden="true"
              className={cn(
                "rounded-[2px]",
                METHOD_COLOR[s.key],
                size === "sm" ? "size-2" : "size-[9px]",
              )}
            />
            {copy.methodLabel(s.key)}
            <span className="num font-semibold text-muted-foreground">{s.pct}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Desktop "Collections" card: title, total, change, labelled bars and the
 *  How clients paid split. */
export function CollectionsCard({ money, timeZone }: { money: HomeMoney; timeZone: string }) {
  const [period, setPeriod] = useState<Period>("7d");
  const copy = usePeriodCopy();
  const bars = buildBars(
    money,
    period,
    copy.lang,
    timeZone,
    (a, b) => copy.t("date_range", { from: a, to: b }) || `${a} to ${b}`,
  );
  const max = Math.max(...bars.map((b) => b.amount), 0);
  const { total } = periodTotals(money, period);
  const last = bars.length - 1;
  return (
    <section
      aria-label={copy.t("collections_title") || "Collections"}
      className="flex min-w-0 flex-[999_1_560px] flex-col gap-[18px] rounded-2xl border border-border bg-card p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-[19px]">{copy.title(period)}</h2>
          <div className="flex flex-wrap items-baseline gap-2.5">
            <span className="num text-[30px] tracking-[-0.6px]">{formatMoney(total)}</span>
            <DeltaLine money={money} period={period} />
          </div>
        </div>
        <Segmented
          value={period}
          onChange={setPeriod}
          label={copy.t("period_label") || "Period"}
          options={PERIODS.map((p) => ({ value: p, label: copy.periodLabel(p) }))}
        />
      </div>
      <figure className="m-0">
        <div
          className="flex h-[220px] items-end gap-3.5 border-b border-divider px-1"
          aria-hidden="true"
        >
          {bars.map((b, i) => (
            <div
              key={`${b.label}-${i}`}
              title={`${b.title}: ${formatMoney(b.amount)}`}
              className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
            >
              <span className="num truncate text-[11px] font-semibold text-muted-foreground">
                {b.amount > 0 ? compactNaira(b.amount) : ""}
              </span>
              <div
                className={cn(
                  "w-full max-w-16 rounded-t-md rounded-b-[2px]",
                  i === last ? "bg-bar-latest" : "bg-bar opacity-[0.88]",
                )}
                style={{
                  height: `${Math.max(6, max > 0 ? Math.round((b.amount / max) * 170) : 6)}px`,
                }}
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-3.5 px-1" aria-hidden="true">
          {bars.map((b, i) => (
            <span
              key={`${b.label}-l-${i}`}
              className="min-w-0 flex-1 truncate text-center text-xs text-muted-foreground"
            >
              {b.label}
            </span>
          ))}
        </div>
        <figcaption className="sr-only">
          {bars.map((b) => `${b.title}: ${formatMoney(b.amount)}`).join("; ")}
        </figcaption>
      </figure>
      {total === 0 && (
        <p className="-mt-2 text-xs text-muted-foreground">
          {copy.t("collections_empty") || "Payments you record will show here."}
        </p>
      )}
      <div className="flex flex-col gap-2.5">
        <span className="text-[13px] font-bold">
          {copy.t("how_clients_paid") || "How clients paid"}
        </span>
        <PaySplit money={money} period={period} />
      </div>
    </section>
  );
}

/** Phone hero card that overlaps the navy header by 64px. */
export function HeroCollections({ money, timeZone }: { money: HomeMoney; timeZone: string }) {
  const [period, setPeriod] = useState<Period>("today");
  const copy = usePeriodCopy();
  const bars = buildBars(
    money,
    period,
    copy.lang,
    timeZone,
    (a, b) => copy.t("date_range", { from: a, to: b }) || `${a} to ${b}`,
  );
  const max = Math.max(...bars.map((b) => b.amount), 0);
  const { total } = periodTotals(money, period);
  return (
    <section
      aria-label={copy.t("collections_title") || "Collections"}
      className="relative mx-4 -mt-16 flex flex-col gap-3.5 rounded-[18px] bg-card p-[18px] shadow-hero"
    >
      <Segmented
        value={period}
        onChange={setPeriod}
        stretch
        label={copy.t("period_label") || "Period"}
        options={PERIODS.map((p) => ({ value: p, label: copy.periodLabel(p) }))}
      />
      <div className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[13px] font-semibold text-muted-foreground">
            {copy.title(period)}
          </span>
          <span className="num text-[30px] leading-tight tracking-[-0.6px]">
            {formatMoney(total)}
          </span>
          <DeltaLine money={money} period={period} />
        </div>
        <div aria-hidden="true" className="flex h-16 w-[132px] shrink-0 items-end gap-1">
          {bars.slice(-8).map((b, i, arr) => (
            <div
              key={`${b.label}-${i}`}
              className={cn(
                "min-w-0 flex-1 rounded-t rounded-b-[1px]",
                i === arr.length - 1 ? "bg-bar-latest" : "bg-bar opacity-85",
              )}
              style={{
                height: `${Math.max(4, max > 0 ? Math.round((b.amount / max) * 60) : 4)}px`,
              }}
            />
          ))}
        </div>
      </div>
      <div className="border-t border-divider pt-3">
        <PaySplit money={money} period={period} size="sm" />
      </div>
    </section>
  );
}
