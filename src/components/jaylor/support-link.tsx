import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SUPPORT_PHONE } from "@/lib/jaylor";
import { cn } from "@/lib/utils";

export function SupportLink({ className }: { className?: string }) {
  return (
    <Button asChild variant="outline" className={cn("border-2 bg-foreground/[0.03]", className)}>
      <a
        href={`https://wa.me/${SUPPORT_PHONE.replace(/\D/g, "")}?text=${encodeURIComponent("Hello Jaylor, I have a question about using Jaylor for my tailoring business.")}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <MessageCircle aria-hidden="true" /> Talk to us on WhatsApp
      </a>
    </Button>
  );
}
