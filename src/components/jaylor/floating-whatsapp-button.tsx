import { MessageCircle } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import { SUPPORT_WHATSAPP_URL } from "@/lib/jaylor";

/**
 * Public pages only -- hidden inside the signed-in app and platform admin,
 * which have their own navigation (Ask Jaylor's own floating button, the
 * bottom tab bar). Sits above the install prompt's reserved space and rises
 * further via --jaylor-cookie-h (published by CookieBanner) so it never
 * covers the cookie notice while that is open.
 */
export function FloatingWhatsAppButton() {
  const inApp = useRouterState({
    select: (s) => s.matches.some((m) => m.routeId === "/_authenticated" || m.routeId === "/admin"),
  });
  if (inApp) return null;

  return (
    <a
      href={SUPPORT_WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      className="fixed bottom-[calc(6rem+var(--jaylor-cookie-h,0px))] right-4 z-40 flex h-14 items-center gap-2 rounded-full bg-[#25D366] pl-3.5 pr-3.5 text-white shadow-lg transition-transform hover:scale-105 sm:bottom-[calc(1.5rem+var(--jaylor-cookie-h,0px))] sm:right-6 sm:pr-5"
    >
      <MessageCircle aria-hidden="true" className="size-7 shrink-0" />
      <span className="hidden text-sm font-medium sm:inline">Chat with us</span>
    </a>
  );
}
