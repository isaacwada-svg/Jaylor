import { MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { whatsappLink } from "@/lib/whatsapp";

export function RemindButton({
  storeId,
  clientId,
  orderId,
  phone,
  consentWhatsapp,
  message,
  template,
  label = "Remind",
}: {
  storeId: string;
  clientId: string;
  orderId?: string;
  phone: string;
  consentWhatsapp: boolean;
  message: string;
  template: string;
  label?: string;
}) {
  async function handleClick() {
    window.open(whatsappLink(phone, message), "_blank", "noopener,noreferrer");
    try {
      const { data: userData } = await supabase.auth.getUser();
      await supabase.from("messages").insert({
        store_id: storeId,
        client_id: clientId,
        order_id: orderId ?? null,
        template,
        channel: "tap",
        sent_by: userData.user?.id ?? null,
      });
    } catch {
      // Best-effort log; never block the tap-to-send action on it.
    }
  }

  if (!consentWhatsapp) {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled
        title="This client hasn't given WhatsApp consent"
      >
        <MessageCircle className="size-4" />
        {label}
      </Button>
    );
  }

  return (
    <Button size="sm" variant="outline" onClick={handleClick}>
      <MessageCircle className="size-4" />
      {label}
    </Button>
  );
}
