import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { readConsent, saveConsent, startOptionalTracking } from "@/lib/consent";

export function CookieBanner() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const c = readConsent();
    if (c === "accepted") startOptionalTracking();
    if (c === null) setOpen(true);
  }, []);

  if (!open) return null;

  const choose = (state: "accepted" | "rejected") => {
    saveConsent(state);
    setOpen(false);
  };

  return (
    <div
      role="region"
      aria-label="Cookie choices"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-accent/40 bg-primary text-primary-foreground shadow-2xl"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-6">
        <p className="flex-1 text-sm leading-relaxed text-primary-foreground/85">
          Jaylor uses essential storage to keep you signed in. With your permission we also use
          Google Analytics and Microsoft Clarity to improve the app and catch errors.{" "}
          <Link to="/cookies" className="text-accent underline underline-offset-2">
            Learn more
          </Link>
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => choose("rejected")}
            className="min-h-11 flex-1 border border-primary-foreground/40 px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-foreground/10 sm:flex-none"
          >
            Reject All
          </button>
          <button
            type="button"
            onClick={() => choose("accepted")}
            className="min-h-11 flex-1 bg-accent px-4 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 sm:flex-none"
          >
            Accept All
          </button>
        </div>
      </div>
    </div>
  );
}
