import type { LanguageCode } from "@/lib/i18n/languages";
import type { HomeMoney, MethodTotals } from "@/lib/home-dashboard";

/** Day-first dates ("Friday, 9 October 2026"). Intl has no Nigerian Pidgin,
 *  so it reads dates the British-English way, like English does. */
export function intlLocale(lang: LanguageCode): string[] {
  return [lang === "en" || lang === "pcm" ? "en-GB" : lang, "en-GB"];
}

/** "Friday, 9 October 2026" (or without the year on the phone). */
export function formatLongDate(date: Date, lang: LanguageCode, withYear: boolean): string {
  const locale = intlLocale(lang);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "long" }).format(date);
  const rest = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    ...(withYear ? { year: "numeric" } : {}),
  }).format(date);
  return `${weekday}, ${rest}`;
}

export function formatShortDate(iso: string, lang: LanguageCode): string {
  return new Intl.DateTimeFormat(intlLocale(lang), { day: "numeric", month: "short" }).format(
    new Date(`${iso}T12:00:00`),
  );
}

export function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(new Date(iso));
}

export function weekdayName(date: Date, lang: LanguageCode): string {
  return new Intl.DateTimeFormat(intlLocale(lang), { weekday: "long" }).format(date);
}

export function compactNaira(n: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    currencyDisplay: "narrowSymbol",
    notation: "compact",
    maximumFractionDigits: n >= 1_000_000 ? 2 : 1,
  }).format(n);
}

export type Delta = { value: number; text: string; tone: "up" | "down" | "flat" };

/** Percentage change, or null when there's nothing to compare against. */
export function pctChange(current: number, previous: number): Delta | null {
  if (previous <= 0) return null;
  const value = ((current - previous) / previous) * 100;
  const rounded = Math.abs(value) < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return {
    value: rounded,
    text: `${sign}${Math.abs(rounded)}%`,
    tone: rounded > 0 ? "up" : rounded < 0 ? "down" : "flat",
  };
}

/** Change in percentage points, e.g. "+2.1 pt". */
export function pointChange(current: number | null, previous: number | null): Delta | null {
  if (current === null || previous === null) return null;
  const value = Math.round((current - previous) * 10) / 10;
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return {
    value,
    text: `${sign}${Math.abs(value)} pt`,
    tone: value > 0 ? "up" : value < 0 ? "down" : "flat",
  };
}

export type Period = "today" | "7d" | "30d";

export type Bar = { label: string; title: string; amount: number };

function hourNow(timeZone: string): number {
  const h = new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    hourCycle: "h23",
    timeZone,
  }).format(new Date());
  return Number(h) || 0;
}

function hourLabel(h: number, lang: LanguageCode): string {
  const d = new Date(2026, 0, 1, h);
  return new Intl.DateTimeFormat(intlLocale(lang), { hour: "numeric" }).format(d);
}

/** Bars for the collections chart: by hour today, by day for 7 days, by
 *  week for 30 days (the oldest week also takes the two extra days). */
export function buildBars(
  money: HomeMoney,
  period: Period,
  lang: LanguageCode,
  timeZone: string,
  range: (from: string, to: string) => string,
): Bar[] {
  if (period === "today") {
    const now = hourNow(timeZone);
    const firstPaid = money.today.hourly.findIndex((v) => v > 0);
    let start = Math.min(8, firstPaid === -1 ? 8 : firstPaid);
    if (start > now) start = now;
    const bars: Bar[] = [];
    for (let h = start; h <= now; h++) {
      const label = hourLabel(h, lang);
      bars.push({ label, title: label, amount: money.today.hourly[h] ?? 0 });
    }
    return bars;
  }
  if (period === "7d") {
    return money.days.slice(-7).map((d) => {
      const date = new Date(`${d.date}T12:00:00`);
      return {
        label: new Intl.DateTimeFormat(intlLocale(lang), { weekday: "short" }).format(date),
        title: formatShortDate(d.date, lang),
        amount: d.amount,
      };
    });
  }
  const days = money.days.slice(-30);
  const ranges: [number, number][] = [
    [0, days.length - 22],
    [days.length - 21, days.length - 15],
    [days.length - 14, days.length - 8],
    [days.length - 7, days.length - 1],
  ];
  return ranges.map(([from, to]) => {
    const slice = days.slice(Math.max(0, from), to + 1);
    const first = slice[0]?.date ?? "";
    const last = slice[slice.length - 1]?.date ?? "";
    return {
      label: first ? formatShortDate(first, lang) : "",
      title: first && last ? range(formatShortDate(first, lang), formatShortDate(last, lang)) : "",
      amount: slice.reduce((sum, d) => sum + d.amount, 0),
    };
  });
}

export function periodTotals(money: HomeMoney, period: Period) {
  if (period === "today") {
    return { total: money.today.total, prev: money.today.prev_total, methods: money.today.methods };
  }
  const p = period === "7d" ? money.d7 : money.d30;
  return { total: p.total, prev: p.prev_total, methods: p.methods };
}

export type MethodKey = "transfer" | "cash" | "paystack" | "pos" | "other";

export const METHOD_ORDER: MethodKey[] = ["transfer", "cash", "paystack", "pos", "other"];

/** Shares of each payment method, largest rounding remainder first so the
 *  legend always adds up to 100. */
export function methodSplit(
  methods: MethodTotals,
): { key: MethodKey; amount: number; pct: number }[] {
  const grouped: Record<MethodKey, number> = {
    transfer: 0,
    cash: 0,
    paystack: 0,
    pos: 0,
    other: 0,
  };
  for (const [method, amount] of Object.entries(methods)) {
    const key = (METHOD_ORDER as string[]).includes(method) ? (method as MethodKey) : "other";
    grouped[key] += Number(amount) || 0;
  }
  const total = METHOD_ORDER.reduce((sum, k) => sum + grouped[k], 0);
  if (total <= 0) return [];
  const rows = METHOD_ORDER.filter((k) => grouped[k] > 0).map((key) => {
    const exact = (grouped[key] / total) * 100;
    return { key, amount: grouped[key], pct: Math.floor(exact), rem: exact - Math.floor(exact) };
  });
  let missing = 100 - rows.reduce((sum, r) => sum + r.pct, 0);
  for (const r of [...rows].sort((a, b) => b.rem - a.rem)) {
    if (missing <= 0) break;
    r.pct += 1;
    missing -= 1;
  }
  return rows.map(({ key, amount, pct }) => ({ key, amount, pct }));
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso}T12:00:00`).getTime();
  const b = new Date(`${toIso}T12:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}
