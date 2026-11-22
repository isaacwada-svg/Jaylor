/** Shared capture of the browser's `beforeinstallprompt` event (Android/Chrome
 *  only -- iOS Safari never fires it). The event only ever fires once per page
 *  load, and only listeners already attached when it fires receive it, so this
 *  module attaches its one listener at import time (as early as the client
 *  bundle runs) and fans it out to every subscriber -- the auto-popping
 *  InstallPrompt banner and the manual "Install" button on /app alike --
 *  instead of each mounting its own listener and racing to be first. */

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Listener = (event: BeforeInstallPromptEvent | null) => void;

let capturedEvent: BeforeInstallPromptEvent | null = null;
const listeners = new Set<Listener>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    capturedEvent = event as BeforeInstallPromptEvent;
    listeners.forEach((listener) => listener(capturedEvent));
  });
}

export function getInstallPromptEvent(): BeforeInstallPromptEvent | null {
  return capturedEvent;
}

export function subscribeInstallPrompt(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Runs the captured prompt. Returns "unavailable" if the browser never fired
 *  the event (iOS, desktop Safari/Firefox, or already installed). */
export async function triggerInstallPrompt(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!capturedEvent) return "unavailable";
  const event = capturedEvent;
  await event.prompt();
  const choice = await event.userChoice;
  capturedEvent = null;
  listeners.forEach((listener) => listener(null));
  return choice.outcome;
}

export type DevicePlatform = "ios" | "android" | "other";

export function detectPlatform(): DevicePlatform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  // iPadOS 13+ reports as "Macintosh" with touch support -- the maxTouchPoints
  // check is the standard way to tell it apart from a real Mac.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) {
    return "ios";
  }
  if (/Android/.test(ua)) return "android";
  return "other";
}

/** True if the app is already running installed (standalone display mode). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    // iOS Safari's own non-standard flag, set only once actually installed.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
