// Optional tracking (GA4, Microsoft Clarity, crash logging) stays fully dormant
// until the visitor taps "Accept All". Nothing third-party loads otherwise.

export type ConsentState = "accepted" | "rejected";
const CONSENT_KEY = "jaylor:cookie-consent";
export const CONSENT_EVENT = "jaylor:consent-changed";


const CLARITY_ID = "ynv1ogpjcm";

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
  setGoogleConsent(state);
  if (state === "accepted") startOptionalTracking();
}

let started = false;

export function startOptionalTracking() {
  if (started || typeof window === "undefined") return;
  started = true;
  loadClarity();
  startCrashLogger();
}

function injectScript(src: string) {
  const s = document.createElement("script");
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

function setGoogleConsent(state: ConsentState) {
  const w = window as unknown as { gtag?: (...a: unknown[]) => void };
  const v = state === "accepted" ? "granted" : "denied";
  w.gtag?.("consent", "update", {
    ad_storage: v,
    ad_user_data: v,
    ad_personalization: v,
    analytics_storage: v,
  });
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
