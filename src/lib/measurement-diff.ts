import type { TemplateField } from "@/lib/measurements";

/** Differences smaller than this are noise (measuring tape slop), not a real change. */
export const NOISE_THRESHOLD_IN = 0.25;
export const NOISE_THRESHOLD_CM = 0.5;

export function convertMeasurement(value: number, fromUnit: string, toUnit: string): number {
  if (fromUnit === toUnit) return value;
  if (fromUnit === "in" && toUnit === "cm") return value * 2.54;
  if (fromUnit === "cm" && toUnit === "in") return value / 2.54;
  return value;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function isMissing(v: unknown): boolean {
  return v === undefined || v === null || v === "";
}

function humanizeKey(key: string): string {
  const spaced = key.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export type MeasurementFieldChange = {
  key: string;
  label: string;
  status: "added" | "removed" | "increased" | "decreased" | "changed" | "unchanged";
  /** Formatted number (no unit) for numeric fields, or the raw text for text fields. */
  oldDisplay: string | null;
  newDisplay: string | null;
  /** e.g. "+1.5" -- the unit is shown once alongside the whole comparison, not per field. */
  deltaText: string | null;
  isNumeric: boolean;
};

export type MeasurementSetLike = {
  values: Record<string, unknown> | null;
  extra_fields: Record<string, unknown> | null;
  unit: string;
  template_id: string | null;
};

/**
 * Compares two measurement sets by field key across `values` and
 * `extra_fields`. Converts the older numeric value into the newer set's unit
 * before comparing, per spec (1 in = 2.54 cm), and returns display values
 * already in that unit.
 */
export function diffMeasurementFields(
  older: MeasurementSetLike,
  newer: MeasurementSetLike,
  labelForValueKey: (key: string) => string,
): MeasurementFieldChange[] {
  const oldValues = older.values ?? {};
  const newValues = newer.values ?? {};
  const oldExtra = older.extra_fields ?? {};
  const newExtra = newer.extra_fields ?? {};

  const isValueKey = (key: string) =>
    Object.prototype.hasOwnProperty.call(oldValues, key) ||
    Object.prototype.hasOwnProperty.call(newValues, key);

  const oldFlat: Record<string, unknown> = { ...oldValues, ...oldExtra };
  const newFlat: Record<string, unknown> = { ...newValues, ...newExtra };
  const keys = [...new Set([...Object.keys(oldFlat), ...Object.keys(newFlat)])];

  const threshold = newer.unit === "cm" ? NOISE_THRESHOLD_CM : NOISE_THRESHOLD_IN;
  const changes: MeasurementFieldChange[] = [];

  for (const key of keys) {
    const oldRaw = oldFlat[key];
    const newRaw = newFlat[key];
    const oldMissing = isMissing(oldRaw);
    const newMissing = isMissing(newRaw);
    if (oldMissing && newMissing) continue;

    const label = isValueKey(key) ? labelForValueKey(key) : humanizeKey(key);

    if (oldMissing) {
      changes.push({
        key,
        label,
        status: "added",
        oldDisplay: null,
        newDisplay: typeof newRaw === "number" ? String(round1(newRaw)) : String(newRaw),
        deltaText: null,
        isNumeric: typeof newRaw === "number",
      });
      continue;
    }
    if (newMissing) {
      changes.push({
        key,
        label,
        status: "removed",
        oldDisplay: typeof oldRaw === "number" ? String(round1(oldRaw)) : String(oldRaw),
        newDisplay: null,
        deltaText: null,
        isNumeric: typeof oldRaw === "number",
      });
      continue;
    }

    if (typeof oldRaw === "number" && typeof newRaw === "number") {
      const oldConverted = convertMeasurement(oldRaw, older.unit, newer.unit);
      const delta = newRaw - oldConverted;
      if (Math.abs(delta) < threshold) {
        changes.push({
          key,
          label,
          status: "unchanged",
          oldDisplay: String(round1(oldConverted)),
          newDisplay: String(round1(newRaw)),
          deltaText: null,
          isNumeric: true,
        });
      } else {
        changes.push({
          key,
          label,
          status: delta > 0 ? "increased" : "decreased",
          oldDisplay: String(round1(oldConverted)),
          newDisplay: String(round1(newRaw)),
          deltaText: `${delta > 0 ? "+" : ""}${round1(delta)}`,
          isNumeric: true,
        });
      }
    } else {
      const oldText = String(oldRaw).trim();
      const newText = String(newRaw).trim();
      changes.push({
        key,
        label,
        status: oldText === newText ? "unchanged" : "changed",
        oldDisplay: oldText,
        newDisplay: newText,
        deltaText: null,
        isNumeric: false,
      });
    }
  }

  return changes;
}

export function countChanged(changes: MeasurementFieldChange[]): number {
  return changes.filter((c) => c.status !== "unchanged").length;
}

export function templateChangedBetween(
  older: { template_id: string | null },
  newer: { template_id: string | null },
): boolean {
  return (older.template_id ?? null) !== (newer.template_id ?? null);
}

/** Resolves a `values`-origin key's label from whichever template has it, preferring the newer one. */
export function makeValueKeyLabeller(
  olderFields: TemplateField[],
  newerFields: TemplateField[],
): (key: string) => string {
  return (key: string) =>
    newerFields.find((f) => f.key === key)?.label ??
    olderFields.find((f) => f.key === key)?.label ??
    humanizeKey(key);
}
