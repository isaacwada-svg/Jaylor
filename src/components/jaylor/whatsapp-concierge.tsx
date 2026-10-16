import { MessageCircle } from "lucide-react";
import { SUPPORT_WHATSAPP_URL } from "@/lib/jaylor";

/** Floating WhatsApp button shown on public pages: personal setup help from Isaac. */
export function WhatsAppConcierge() {
  return (
    <a
      href={SUPPORT_WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with Isaac on WhatsApp, I'll set you up in 10 mins"
      className="fixed bottom-[calc(1rem+var(--jaylor-cookie-h,0px))] right-4 z-40 inline-flex items-center gap-2 rounded-full bg-whatsapp px-4 py-3 text-sm font-semibold text-whatsapp-foreground shadow-lg transition-transform hover:-translate-y-0.5"
    >
      <MessageCircle className="size-5" aria-hidden="true" />
      <span className="hidden sm:inline">Chat with Isaac. I'll set you up in 10 mins</span>
      <span className="sm:hidden">Chat with Isaac</span>
    </a>
  );
}
