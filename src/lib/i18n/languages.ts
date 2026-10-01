/** The five languages Jaylor's client-facing pages support. Each language
 *  names itself in its own script/spelling for the switcher, per spec. */
export const LANGUAGES = [
  { code: "en", nativeName: "English" },
  { code: "pcm", nativeName: "Naijá" },
  { code: "ha", nativeName: "Hausa" },
  { code: "yo", nativeName: "Yorùbá" },
  { code: "ig", nativeName: "Igbo" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

export const DEFAULT_LANGUAGE: LanguageCode = "en";

const CODES = new Set<string>(LANGUAGES.map((l) => l.code));

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === "string" && CODES.has(value);
}

/** Every namespace shipped so far -- each file lives at
 *  src/lib/i18n/resources/{lang}/{namespace}.json.
 *  common..events: client-facing pages (PR L).
 *  auth, app_common, app_settings: the tailor's own app screens, part 2 (PR M).
 *  app_dashboard, app_orders, app_order_form, app_clients, app_payments,
 *  app_payroll, app_inventory: the tailor's own app screens, part 3 (PR M2) --
 *  see docs/translations.md for what's covered and what's still deferred. */
export const NAMESPACES = [
  "common",
  "tracking",
  "approval",
  "passport",
  "directory",
  "storefront",
  "quotes",
  "events",
  "auth",
  "app_common",
  "app_settings",
  "app_dashboard",
  "app_orders",
  "app_order_form",
  "app_clients",
  "app_payments",
  "app_payroll",
  "app_inventory",
] as const;

export type Namespace = (typeof NAMESPACES)[number];
