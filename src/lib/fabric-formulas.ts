/**
 * Fabric calculator, rule-based (no AI): a base-yards-per-garment config
 * table, adjusted for fabric width and pattern, with waste added for a
 * purchase quantity. Once a shop has enough of its own order history for a
 * garment type, that real average replaces the generic formula entirely —
 * "learning from corrections" without needing a separate editable table,
 * since the correction IS whatever yards the tailor actually saves per order.
 */

export type FabricPattern = "plain" | "directional" | "large_repeat";

export const FABRIC_PATTERNS: { value: FabricPattern; label: string }[] = [
  { value: "plain", label: "Plain" },
  { value: "directional", label: "Directional (one-way print)" },
  { value: "large_repeat", label: "Large repeat pattern" },
];

/** Base yards per garment type, for an average adult, 45" fabric width, plain pattern. */
export const FABRIC_BASE_YARDS: Record<string, number> = {
  Agbada: 6,
  Kaftan: 4,
  Senator: 4.5,
  "Iro and buba": 5,
  Gown: 5,
  "Skirt and blouse": 4,
  Suit: 4.5,
  Shirt: 2.5,
  Trousers: 2,
  Bridal: 8,
  "Children's wear": 2,
  Other: 4,
};

const REFERENCE_WIDTH_INCHES = 45;
const PATTERN_MULTIPLIER: Record<FabricPattern, number> = {
  plain: 1,
  directional: 1.15,
  large_repeat: 1.25,
};
const WASTE_ALLOWANCE = 0.1;
const MIN_QUANTITY_FOR_STORE_AVERAGE = 3;

export type FabricEstimate = {
  perPiece: number;
  totalNeeded: number;
  suggestedPurchase: number;
  source: "history" | "formula";
};

export function estimateFabricYards({
  garmentType,
  quantity,
  fabricWidth,
  pattern,
  storeAverage,
  storeAverageCount,
}: {
  garmentType: string;
  quantity: number;
  fabricWidth: number;
  pattern: FabricPattern;
  storeAverage: number | null;
  storeAverageCount: number;
}): FabricEstimate {
  const useHistory = storeAverage != null && storeAverageCount >= MIN_QUANTITY_FOR_STORE_AVERAGE;
  const baseYards = FABRIC_BASE_YARDS[garmentType] ?? FABRIC_BASE_YARDS["Other"] ?? 4;
  const perPiece = useHistory
    ? (storeAverage as number)
    : baseYards * (REFERENCE_WIDTH_INCHES / Math.max(fabricWidth, 1)) * PATTERN_MULTIPLIER[pattern];

  const totalNeeded = perPiece * Math.max(quantity, 1);
  const suggestedPurchase = Math.ceil(totalNeeded * (1 + WASTE_ALLOWANCE) * 2) / 2;

  return { perPiece, totalNeeded, suggestedPurchase, source: useHistory ? "history" : "formula" };
}
