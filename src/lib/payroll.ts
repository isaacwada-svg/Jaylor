export const PAYROLL_STAGES = [
  "received",
  "cutting",
  "sewing",
  "fitting",
  "adjustments",
  "ready",
  "collected",
] as const;

export type PayrollStage = (typeof PAYROLL_STAGES)[number] | "whole";

export const STAGE_LABELS: Record<PayrollStage, string> = {
  received: "Received",
  cutting: "Cutting",
  sewing: "Sewing",
  fitting: "Fitting",
  adjustments: "Adjustments",
  ready: "Ready",
  collected: "Collected",
  whole: "Whole garment",
};

export type PayrollWarning = {
  id: string;
  order_id: string;
  stage: string;
  status: "needs_rate" | "unassigned";
  earned_at: string;
};

// Lagos has no DST, so a fixed +1h offset from UTC reliably identifies the
// Lagos-local calendar day for any timestamp -- no Intl/timezone data needed.
const LAGOS_OFFSET_MS = 60 * 60_000;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The Monday-Sunday (Africa/Lagos) week containing `now`. */
export function currentPayrollWeek(now: Date = new Date()): { start: string; end: string } {
  const lagos = new Date(now.getTime() + LAGOS_OFFSET_MS);
  const day = lagos.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const sinceMonday = (day + 6) % 7;
  const monday = new Date(lagos);
  monday.setUTCDate(lagos.getUTCDate() - sinceMonday);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { start: isoDate(monday), end: isoDate(sunday) };
}

/** Shifts a Monday-Sunday period by whole weeks (negative = earlier). */
export function shiftPayrollWeek(
  period: { start: string; end: string },
  deltaWeeks: number,
): { start: string; end: string } {
  const start = new Date(`${period.start}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() + deltaWeeks * 7);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { start: isoDate(start), end: isoDate(end) };
}

export function formatPeriodLabel(period: { start: string; end: string }): string {
  const fmt = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-NG", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  return `${fmt(period.start)} – ${fmt(period.end)}`;
}

export type PayrollLineRow = {
  member_ref: string;
  jobs_count: number;
  gross: number;
  advances: number;
  net: number;
  carried_forward: number;
};

/** One CSV row per member: name, jobs, gross, advances, net, period. */
export function buildPayrollCsv(
  period: { start: string; end: string },
  lines: PayrollLineRow[],
  nameByMember: (memberRef: string) => string,
): string {
  const escape = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["Staff", "Jobs", "Gross", "Advances", "Net", "Period"];
  const rows = lines.map((l) => [
    nameByMember(l.member_ref),
    l.jobs_count,
    l.gross,
    l.advances,
    l.net,
    formatPeriodLabel(period),
  ]);
  return [header, ...rows].map((row) => row.map(escape).join(",")).join("\n");
}
