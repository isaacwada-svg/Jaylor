import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const VISIT_KEY = "jaylor:visitCount";
const DISMISSED_KEY = "jaylor:installDismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [eligible, setEligible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISSED_KEY)) return;
      const count = Number(localStorage.getItem(VISIT_KEY) ?? "0") + 1;
      localStorage.setItem(VISIT_KEY, String(count));
      if (count >= 2) setEligible(true);
    } catch {
      // ignore storage failures
    }

    function handler(event: Event) {
      event.preventDefault();
      setDeferredEvent(event as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!eligible || !deferredEvent) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // ignore
    }
    setEligible(false);
  }

  async function install() {
    if (!deferredEvent) return;
    await deferredEvent.prompt();
    const choice = await deferredEvent.userChoice;
    if (choice.outcome === "accepted") setDeferredEvent(null);
    dismiss();
  }

  return (
    <div className="fixed inset-x-4 bottom-20 z-30 mx-auto flex max-w-sm items-center justify-between gap-3 rounded-2xl border border-gold/40 bg-card px-4 py-3 shadow-lg lg:bottom-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">Install Jaylor</p>
        <p className="text-xs text-muted-foreground">
          Add it to your home screen for quick access.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" onClick={install}>
          <Download className="size-4" />
          Install
        </Button>
        <Button size="icon" variant="ghost" onClick={dismiss} aria-label="Dismiss">
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
