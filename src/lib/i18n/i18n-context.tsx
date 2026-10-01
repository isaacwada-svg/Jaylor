import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import i18next, { type i18n as I18nInstance } from "i18next";
import { DEFAULT_LANGUAGE, isLanguageCode, type LanguageCode, type Namespace } from "./languages";
import { loadNamespaces, type ResourceBundle } from "./load-namespaces";
import { LANGUAGE_COOKIE_NAME } from "./resolve-language.server";

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

// --- The tailor's own app (PR M, part 2) -----------------------------------
//
// The authenticated app is client-only (`ssr: false` on `/_authenticated`),
// so there's no SSR flash-of-English risk to guard against the way /t or /a
// needed to. Instead of one resource bundle resolved up front in a loader,
// AppI18nProvider keeps ONE long-lived i18next instance per language for the
// whole authenticated app, and each screen lazily merges its own namespace
// into that instance on mount via useAppT -- same engine, same
// load-namespaces.ts loader and English-fallback-merge rules as PR L, just a
// different (simpler, since there's no SSR) delivery mechanism.

function readLanguageCookie(): LanguageCode | null {
  const match = document.cookie.match(/(?:^|; )jaylor_lang=([^;]+)/);
  const value = match?.[1] ? decodeURIComponent(match[1]) : null;
  return isLanguageCode(value) ? value : null;
}

function writeLanguageCookie(code: LanguageCode) {
  const oneYear = 60 * 60 * 24 * 365;
  document.cookie = `${LANGUAGE_COOKIE_NAME}=${code}; path=/; max-age=${oneYear}; samesite=lax`;
}

function parseBrowserLanguage(): LanguageCode | null {
  for (const candidate of navigator.languages ?? [navigator.language]) {
    const base = candidate.toLowerCase().split("-")[0] ?? "";
    if (isLanguageCode(base)) return base;
    if (isLanguageCode(candidate.toLowerCase())) return candidate.toLowerCase() as LanguageCode;
  }
  return null;
}

/** Priority for the app's own screens: the user's saved profile.ui_language
 *  -> the jaylor_lang cookie -> the current store's language -> the
 *  browser's language if supported -> English. */
export function resolveAppLanguage(
  profileUiLanguage: string | null | undefined,
  storeLanguage: string | null | undefined,
): LanguageCode {
  if (isLanguageCode(profileUiLanguage)) return profileUiLanguage;
  const cookie = readLanguageCookie();
  if (cookie) return cookie;
  if (isLanguageCode(storeLanguage)) return storeLanguage;
  const browser = parseBrowserLanguage();
  if (browser) return browser;
  return DEFAULT_LANGUAGE;
}

type AppI18nContextValue = {
  language: LanguageCode;
  instance: I18nInstance;
  loadedNamespaces: ReadonlySet<Namespace>;
  ensureNamespace: (namespace: Namespace) => void;
  setLanguage: (code: LanguageCode) => void;
};

const AppI18nContext = createContext<AppI18nContextValue | null>(null);

/** Wraps the whole authenticated app (alongside StoreProvider in
 *  _authenticated/route.tsx). `profileUiLanguage`/`storeLanguage` are passed
 *  in by the caller (which already has this data from useStore()/a profile
 *  query) so this component stays free of its own data-fetching. */
export function AppI18nProvider({
  profileUiLanguage,
  storeLanguage,
  children,
}: {
  profileUiLanguage: string | null | undefined;
  storeLanguage: string | null | undefined;
  children: ReactNode;
}) {
  const [language, setLanguageState] = useState<LanguageCode>(() =>
    resolveAppLanguage(profileUiLanguage, storeLanguage),
  );
  const [loadedNamespaces, setLoadedNamespaces] = useState<ReadonlySet<Namespace>>(new Set());
  const inFlight = useRef<Set<Namespace>>(new Set());

  const instance = useMemo(() => {
    const inst = i18next.createInstance();
    void inst.init({
      lng: language,
      fallbackLng: DEFAULT_LANGUAGE,
      ns: [],
      resources: { [language]: {} },
      interpolation: { escapeValue: false },
      initImmediate: false,
      returnEmptyString: false,
    });
    return inst;
  }, [language]);

  // A fresh instance starts empty -- nothing is "loaded" for it yet.
  useEffect(() => {
    setLoadedNamespaces(new Set());
    inFlight.current = new Set();
  }, [instance]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  function ensureNamespace(namespace: Namespace) {
    if (loadedNamespaces.has(namespace) || inFlight.current.has(namespace)) return;
    inFlight.current.add(namespace);
    loadNamespaces(language, [namespace])
      .then((result) => {
        const bundle = result[namespace];
        if (bundle) instance.addResourceBundle(language, namespace, bundle, true, true);
      })
      .catch(() => {
        // Offline and this namespace/language was never cached by the
        // service worker (same JS-chunk caching every other offline screen
        // already relies on) -- mark it "loaded" anyway so useAppT stops
        // retrying every render; its t() calls return "" rather than hang.
      })
      .finally(() => {
        setLoadedNamespaces((prev) => new Set(prev).add(namespace));
      });
  }

  function setLanguage(code: LanguageCode) {
    writeLanguageCookie(code);
    setLanguageState(code);
    // Best-effort -- the cookie + in-memory state above already applied the
    // change for this session even if persisting it to the profile fails.
    void import("@/integrations/supabase/client").then(({ supabase }) =>
      supabase.rpc("set_my_ui_language", { p_language: code }).then(({ error }) => {
        if (error) console.error("Could not save language preference", error);
      }),
    );
  }

  const value = useMemo(
    () => ({ language, instance, loadedNamespaces, ensureNamespace, setLanguage }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [language, instance, loadedNamespaces],
  );

  return <AppI18nContext.Provider value={value}>{children}</AppI18nContext.Provider>;
}

function useAppI18nContext(): AppI18nContextValue {
  const ctx = useContext(AppI18nContext);
  if (!ctx) throw new Error("useAppT/useAppLanguage must be used inside an AppI18nProvider");
  return ctx;
}

/** The tailor's own current app language (independent of any client page's
 *  language, and independent of any other staff member's own choice). */
export function useAppLanguage(): LanguageCode {
  return useAppI18nContext().language;
}

/** Changes the app's language immediately (no reload, no logout) -- writes
 *  the cookie, updates in-memory state so every mounted screen re-renders,
 *  and best-effort persists it to the user's own profile in the background. */
export function useSetAppLanguage(): (code: LanguageCode) => void {
  return useAppI18nContext().setLanguage;
}

/** t("key", { var }) for one app-screen namespace, lazily merged into the
 *  shared instance on first use. Returns "" for keys not loaded yet (a very
 *  brief flash on first mount of a screen, not on every re-render) -- English
 *  is merged in at load time same as PR L, so this never shows a raw key. */
export function useAppT(namespace: Namespace) {
  const { instance, loadedNamespaces, ensureNamespace, language } = useAppI18nContext();
  useEffect(() => {
    ensureNamespace(namespace);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namespace, language]);
  const ready = loadedNamespaces.has(namespace);
  const t = (key: string, vars?: Record<string, string | number>): string =>
    ready ? instance.t(`${namespace}:${key}`, { ...vars, defaultValue: "" }) : "";
  return Object.assign(t, { ready });
}
