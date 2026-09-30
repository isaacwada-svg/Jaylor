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

/** Every namespace this PR ships -- each file lives at
 *  src/lib/i18n/resources/{lang}/{namespace}.json. */
export const NAMESPACES = [
  "common",
  "tracking",
  "approval",
  "passport",
  "directory",
  "storefront",
  "quotes",
  "events",
] as const;

export type Namespace = (typeof NAMESPACES)[number];
