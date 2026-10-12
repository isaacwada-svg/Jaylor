export const INVENTORY_CATEGORIES = [
  "lining",
  "zip",
  "thread",
  "button",
  "interfacing",
  "stone",
  "lace",
  "fabric",
  "other",
] as const;

export type InventoryCategory = (typeof INVENTORY_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<InventoryCategory, string> = {
  lining: "Lining",
  zip: "Zip",
  thread: "Thread",
  button: "Button",
  interfacing: "Interfacing",
  stone: "Stone",
  lace: "Lace",
  fabric: "Fabric",
  other: "Other",
};

export const INVENTORY_UNITS = ["yard", "metre", "piece", "roll", "pack", "spool"] as const;

export type InventoryUnit = (typeof INVENTORY_UNITS)[number];

export const UNIT_LABELS: Record<InventoryUnit, string> = {
  yard: "Yard",
  metre: "Metre",
  piece: "Piece",
  roll: "Roll",
  pack: "Pack",
  spool: "Spool",
};

/** Pluralizes a unit for display, e.g. "3 yards", "1 spool". */
export function formatQuantity(quantity: number, unit: string): string {
  const label = unit.charAt(0).toUpperCase() + unit.slice(1).toLowerCase();
  return `${quantity} ${quantity === 1 ? label.toLowerCase() : label.toLowerCase() + "s"}`;
}

/** Inactive items are never "low" -- same rule as the dashboard and digest. */
export function isLowStock(item: {
  quantity: number;
  reorder_level: number;
  is_active?: boolean;
}): boolean {
  return item.is_active !== false && item.reorder_level > 0 && item.quantity <= item.reorder_level;
}

/**
 * Parses a typed quantity. Blank -> `blank` (so optional fields can default
 * to 0); anything that isn't a finite, non-negative number -> null.
 */
export function parseQuantity(value: string, blank: number | null = null): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return blank;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
