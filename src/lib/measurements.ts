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
