import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { QrCode, Send, ShieldOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/utils";
import { whatsappLink } from "@/lib/whatsapp";
import { useFeatureDiscovery } from "@/lib/feature-discovery";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function SendPassportButton({
  clientId,
  clientName,
  phone,
}: {
  clientId: string;
  clientName: string;
  phone: string;
}) {
  const queryClient = useQueryClient();
  const discovery = useFeatureDiscovery();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const { data: passport } = useQuery({
    queryKey: ["measurement-passport", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("measurement_passports")
        .select("id, revoked_at")
        .eq("client_id", clientId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  async function turnOff() {
    if (!window.confirm("Turn off this client's measurement card?")) return;
    try {
      const { error } = await supabase.rpc("revoke_measurement_passport_by_store", {
        p_client_id: clientId,
      });
      if (error) throw error;
      toast.success("Measurement card turned off");
      queryClient.invalidateQueries({ queryKey: ["measurement-passport", clientId] });
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not turn off this card"));
    }
  }

  async function openDialog() {
    setBusy(true);
    try {
      const { data: token, error } = await supabase.rpc("issue_measurement_passport", {
        p_client_id: clientId,
      });
      if (error) throw error;
      const url = `${window.location.origin}/passport/${token}`;
      const firstName = clientName.trim().split(/\s+/)[0] || clientName;
      setMessage(
        `Hi ${firstName}, here is your measurement card. Keep the link: you can show it to any Jaylor shop instead of measuring again, or ask for an update any time. ${url}`,
      );
      setOpen(true);
      void discovery.markUsed("measurement_passport");
      queryClient.invalidateQueries({ queryKey: ["measurement-passport", clientId] });
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not create the measurement card"));
    } finally {
      setBusy(false);
    }
  }

  const isActive = !!passport && !passport.revoked_at;

  return (
    <>
      <Button type="button" variant="outline" onClick={openDialog} disabled={busy}>
        <QrCode className="size-4" />
        Send measurement card
      </Button>
      {isActive && (
        <Button type="button" variant="ghost" className="text-owed" onClick={turnOff}>
          <ShieldOff className="size-4" />
          Turn off card
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send measurement card</DialogTitle>
          </DialogHeader>
          <Textarea
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            aria-label="WhatsApp message"
          />
          <DialogFooter>
            <Button asChild className="w-full">
              <a
                href={whatsappLink(phone, message)}
                target="_blank"
                rel="noreferrer"
                onClick={() => setOpen(false)}
              >
                <Send className="size-4" />
                Send on WhatsApp
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
