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

export function isLowStock(item: { quantity: number; reorder_level: number }): boolean {
  return item.reorder_level > 0 && item.quantity <= item.reorder_level;
}
