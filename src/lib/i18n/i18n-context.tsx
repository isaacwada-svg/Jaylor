import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import i18next, { type i18n as I18nInstance } from "i18next";
import { DEFAULT_LANGUAGE, type LanguageCode, type Namespace } from "./languages";
import type { ResourceBundle } from "./load-namespaces";

type I18nContextValue = {
  language: LanguageCode;
  instance: I18nInstance;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function createI18nInstance(
  language: LanguageCode,
  resources: Record<string, ResourceBundle>,
): I18nInstance {
  const instance = i18next.createInstance();
  // Synchronous init (initImmediate: false) with resources already fully
  // resolved (English-merged, see load-namespaces.ts) -- this is what makes
  // the very first server-rendered paint byte-identical to the client's
  // hydration pass, with no flash of English or of a raw key.
  void instance.init({
    lng: language,
    fallbackLng: DEFAULT_LANGUAGE,
    ns: Object.keys(resources),
    resources: { [language]: resources },
    interpolation: { escapeValue: false },
    initImmediate: false,
    returnEmptyString: false,
  });
  return instance;
}

export function I18nProvider({
  language,
  resources,
  children,
}: {
  language: LanguageCode;
  resources: Record<string, ResourceBundle>;
  children: ReactNode;
}) {
  const instance = useMemo(() => createI18nInstance(language, resources), [language, resources]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo(() => ({ language, instance }), [language, instance]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function useI18nContext(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT/useLanguage must be used inside an I18nProvider");
  return ctx;
}

/** The active language for this page (not the shop's or any other client's --
 *  scoped to whatever I18nProvider wraps this component tree). */
export function useLanguage(): LanguageCode {
  return useI18nContext().language;
}

/** t("key", { var: value }) within one namespace. Missing keys resolve to
 *  English (merged in at load time) and never fall through to a raw key. */
export function useT(namespace: Namespace) {
  const { instance } = useI18nContext();
  // defaultValue: "" -- a typo'd key should never surface a raw i18next key
  // on a client-facing page; English is already merged in for every real key
  // (see load-namespaces.ts), so this only fires for a genuine coding mistake.
  return (key: string, vars?: Record<string, string | number>): string =>
    instance.t(`${namespace}:${key}`, { ...vars, defaultValue: "" });
}
