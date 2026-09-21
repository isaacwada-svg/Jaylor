import type { AgeGroup, TemplateSex } from "@/lib/jaylor";
import type { Tables } from "@/integrations/supabase/types";

export type TemplateField = {
  key: string;
  label: string;
  order: number;
  unit?: string;
  min?: number;
  max?: number;
  help_text?: string;
  diagram_url?: string;
  required?: boolean;
};

export function templateFields(template: Tables<"measurement_templates">): TemplateField[] {
  const fields = template.fields;
  if (!Array.isArray(fields)) return [];
  return (fields as unknown as TemplateField[]).slice().sort((a, b) => a.order - b.order);
}

/** Default template for a client: match on age group first, prefer an exact sex match. */
export function pickDefaultTemplate(
  templates: Tables<"measurement_templates">[],
  ageGroup: AgeGroup,
  sex: TemplateSex,
): Tables<"measurement_templates"> | null {
  const visible = templates.filter((t) => !t.hidden);
  const sameAge = visible.filter((t) => t.age_group === ageGroup);
  return (
    sameAge.find((t) => t.sex === sex) ??
    sameAge.find((t) => t.sex === "unisex") ??
    visible.find((t) => t.age_group === "any") ??
    visible[0] ??
    null
  );
}

/** A measurement change beyond this many inches (or cm-equivalent) gets flagged for review. */
export function changeThreshold(ageGroup: AgeGroup): number {
  return ageGroup === "adult" ? 3 : 2;
}

/**
 * Ratio sanity check, rule-based (no AI): waist should normally be smaller
 * than hip, and not disproportionately large next to bust/chest. Matches
 * fields by label keywords rather than a fixed key, since template field
 * keys vary — same approach as MEASUREMENT_GUIDES in measurement-diagram.tsx.
 */
const RATIO_KEYWORDS = {
  bust: ["chest", "bust"],
  waist: ["waist"],
  hip: ["hip", "seat"],
};

function findByLabel(
  fields: TemplateField[],
  values: Record<string, number>,
  keywords: string[],
): number | undefined {
  const field = fields.find((f) => keywords.some((k) => f.label.toLowerCase().includes(k)));
  return field ? values[field.key] : undefined;
}

export function measurementRatioWarnings(
  fields: TemplateField[],
  values: Record<string, number>,
): string[] {
  const bust = findByLabel(fields, values, RATIO_KEYWORDS.bust);
  const waist = findByLabel(fields, values, RATIO_KEYWORDS.waist);
  const hip = findByLabel(fields, values, RATIO_KEYWORDS.hip);
  const warnings: string[] = [];

  if (waist !== undefined && hip !== undefined && waist > hip) {
    warnings.push(
      `Waist ${waist} is larger than hip ${hip}. That's unusual — check before cutting.`,
    );
  }
  if (waist !== undefined && bust !== undefined && waist > bust * 1.4) {
    warnings.push(`Waist ${waist} looks large next to bust/chest ${bust}. Check before cutting.`);
  }
  return warnings;
}
