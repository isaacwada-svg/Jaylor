import type { LanguageCode } from "@/lib/i18n/languages";

/**
 * Field-key -> translated label for the 8 DEFAULT measurement templates every
 * store is seeded with (supabase/migrations/20260920000252_...sql, via the
 * jt_field() helper). These keys are stable and shared across all stores --
 * confirmed in PR L's investigation. A shop's own CUSTOM templates (and any
 * custom field a shop adds to a copy of a default one) keep whatever label
 * the shop typed; this dictionary is only ever consulted when the template
 * the field came from is `is_default`.
 *
 * Not yet wired into any component (see docs/translations.md) -- this PR
 * ships the dictionary itself as the stable-keys deliverable; wiring it into
 * measurements-tab.tsx/order-form.tsx's field render spots is left for the
 * follow-up PR that also covers those screens' own surrounding text.
 */
export const DEFAULT_TEMPLATE_FIELD_LABELS: Record<string, Record<LanguageCode, string>> = {
  bust: {
    en: "Bust",
    pcm: "Chest (woman)",
    ha: "Ƙirji (mace)",
    yo: "Àyà (obìnrin)",
    ig: "Obi (nwanyị)",
  },
  underbust: {
    en: "Underbust",
    pcm: "Under chest",
    ha: "Ƙarƙashin ƙirji",
    yo: "Abẹ́ àyà",
    ig: "Okpuru obi",
  },
  waist: { en: "Waist", pcm: "Waist", ha: "Kugu", yo: "Ẹ̀gbẹ́", ig: "Úkwú" },
  hip: { en: "Hip", pcm: "Hip", ha: "Duwawu", yo: "Ìbàdí", ig: "Ike" },
  shoulder: { en: "Shoulder", pcm: "Shoulder", ha: "Kafada", yo: "Èjìká", ig: "Ubu" },
  sleeve_length: {
    en: "Sleeve length",
    pcm: "Sleeve length",
    ha: "Tsawon hannu",
    yo: "Gígùn apá",
    ig: "Ogologo aka",
  },
  round_sleeve: {
    en: "Round sleeve",
    pcm: "Round sleeve",
    ha: "Zagayen hannu",
    yo: "Yíká apá",
    ig: "Gburugburu aka",
  },
  armhole: { en: "Armhole", pcm: "Armhole", ha: "Ramin hannu", yo: "Ihò apá", ig: "Oghere aka" },
  dress_length: {
    en: "Dress length",
    pcm: "Dress length",
    ha: "Tsawon riga",
    yo: "Gígùn aṣọ",
    ig: "Ogologo uwe",
  },
  blouse_length: {
    en: "Blouse length",
    pcm: "Blouse length",
    ha: "Tsawon blaus",
    yo: "Gígùn bùrọ́sọ̀",
    ig: "Ogologo blaụzụ",
  },
  skirt_length: {
    en: "Skirt length",
    pcm: "Skirt length",
    ha: "Tsawon siket",
    yo: "Gígùn yẹ́rẹ̀pù",
    ig: "Ogologo sket",
  },
  trouser_length: {
    en: "Trouser length",
    pcm: "Trouser length",
    ha: "Tsawon wando",
    yo: "Gígùn sòkòtò",
    ig: "Ogologo trawuzuu",
  },
  thigh: { en: "Thigh", pcm: "Thigh", ha: "Cinya", yo: "Itan", ig: "Apata ukwu" },
  knee: { en: "Knee", pcm: "Knee", ha: "Gwiwa", yo: "Orúnkún", ig: "Ikpere" },
  ankle: { en: "Ankle", pcm: "Ankle", ha: "Idon ƙafa", yo: "Kókósẹ̀", ig: "Nkwonkwo ụkwụ" },
  neck: { en: "Neck", pcm: "Neck", ha: "Wuya", yo: "Ọrùn", ig: "Olu" },
  nipple_to_nipple: {
    en: "Nipple to nipple",
    pcm: "Nipple to nipple",
    ha: "Nono zuwa nono",
    yo: "Ọmú sí ọmú",
    ig: "Ara ruo ara",
  },
  shoulder_to_nipple: {
    en: "Shoulder to nipple",
    pcm: "Shoulder to nipple",
    ha: "Kafada zuwa nono",
    yo: "Èjìká sí ọmú",
    ig: "Ubu ruo ara",
  },
  shoulder_to_waist: {
    en: "Shoulder to waist",
    pcm: "Shoulder to waist",
    ha: "Kafada zuwa kugu",
    yo: "Èjìká sí ẹ̀gbẹ́",
    ig: "Ubu ruo úkwú",
  },
  chest: { en: "Chest", pcm: "Chest", ha: "Ƙirji", yo: "Àyà", ig: "Obi" },
  sleeve: {
    en: "Sleeve length",
    pcm: "Sleeve length",
    ha: "Tsawon hannu",
    yo: "Gígùn apá",
    ig: "Ogologo aka",
  },
  top_length: {
    en: "Top length",
    pcm: "Top length",
    ha: "Tsawon rigar sama",
    yo: "Gígùn ẹ̀wù òkè",
    ig: "Ogologo uwe elu",
  },
  agbada_length: {
    en: "Agbada length",
    pcm: "Agbada length",
    ha: "Tsawon agbada",
    yo: "Gígùn agbádá",
    ig: "Ogologo agbada",
  },
  bottom: {
    en: "Trouser bottom",
    pcm: "Trouser bottom",
    ha: "Bakin wando",
    yo: "Ìsàlẹ̀ sòkòtò",
    ig: "Ọnụ trawuzuu",
  },
  cap_size: { en: "Cap size", pcm: "Cap size", ha: "Girman hula", yo: "Ìwọ̀n fìlà", ig: "Nha okpu" },
  height: { en: "Height", pcm: "Height", ha: "Tsawo", yo: "Gíga", ig: "Ogologo ahụ" },
  body_length: {
    en: "Body length",
    pcm: "Body length",
    ha: "Tsawon jiki",
    yo: "Gígùn ara",
    ig: "Ogologo ahụ",
  },
};

/** A default template's field label, translated; a custom template's (or a
 *  custom field's) label is returned completely unchanged -- it's the shop's
 *  own words, never translated. */
export function translatedTemplateFieldLabel(
  fieldKey: string,
  fallbackLabel: string,
  isDefaultTemplate: boolean,
  language: LanguageCode,
): string {
  if (!isDefaultTemplate) return fallbackLabel;
  return DEFAULT_TEMPLATE_FIELD_LABELS[fieldKey]?.[language] ?? fallbackLabel;
}
