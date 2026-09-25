// Optional tracking (GA4, Microsoft Clarity, crash logging) stays fully dormant
// until the visitor taps "Accept All". Nothing third-party loads otherwise.

export type ConsentState = "accepted" | "rejected";
const CONSENT_KEY = "jaylor:cookie-consent";
export const CONSENT_EVENT = "jaylor:consent-changed";

// Placeholders: set VITE_GA4_ID (e.g. G-XXXXXXX) and VITE_CLARITY_ID to activate.
const GA4_ID = import.meta.env.VITE_GA4_ID as string | undefined;
const CLARITY_ID = import.meta.env.VITE_CLARITY_ID as string | undefined;

export function readConsent(): ConsentState | null {
  try {
    const v = window.localStorage.getItem(CONSENT_KEY);
    return v === "accepted" || v === "rejected" ? v : null;
  } catch {
    return null;
  }
}

export function saveConsent(state: ConsentState) {
  try {
    window.localStorage.setItem(CONSENT_KEY, state);
  } catch {
    // storage blocked — honour the choice for this visit only
  }
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: state }));
  if (state === "accepted") startOptionalTracking();
}

let started = false;

export function startOptionalTracking() {
  if (started || typeof window === "undefined") return;
  started = true;
  loadGA4();
  loadClarity();
  startCrashLogger();
}

function injectScript(src: string) {
  const s = document.createElement("script");
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

function loadGA4() {
  if (!GA4_ID) return;
  const w = window as unknown as { dataLayer: unknown[]; gtag: (...a: unknown[]) => void };
  w.dataLayer = w.dataLayer || [];
  w.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer.push(arguments);
  };
  w.gtag("js", new Date());
  w.gtag("config", GA4_ID, { anonymize_ip: true });
  injectScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA4_ID)}`);
}

function loadClarity() {
  if (!CLARITY_ID) return;
  const w = window as unknown as { clarity?: { q?: unknown[] } & ((...a: unknown[]) => void) };
  if (!w.clarity) {
    const c = function (...args: unknown[]) {
      (c.q = c.q || []).push(args);
    } as { q?: unknown[] } & ((...a: unknown[]) => void);
    w.clarity = c;
  }
  injectScript(`https://www.clarity.ms/tag/${encodeURIComponent(CLARITY_ID)}`);
}

// Lightweight crash logger: captures uncaught errors and failed promises on
// real devices. Forwards to Clarity/GA4 when present; swap in Sentry later.
function startCrashLogger() {
  const report = (message: string) => {
    const w = window as unknown as {
      gtag?: (...a: unknown[]) => void;
      clarity?: (...a: unknown[]) => void;
    };
    const text = message.slice(0, 300);
    w.gtag?.("event", "exception", { description: text, fatal: false });
    w.clarity?.("event", "js_error");
    console.warn("[jaylor-crash]", text);
  };
  window.addEventListener("error", (e) => report(e.message || "Unknown error"));
  window.addEventListener("unhandledrejection", (e) =>
    report(String((e.reason as Error)?.message ?? e.reason ?? "Unhandled rejection")),
  );
}
