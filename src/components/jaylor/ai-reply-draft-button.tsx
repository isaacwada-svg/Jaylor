import { useState } from "react";
import { toast } from "sonner";
import { MessageCircle, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { whatsappLink } from "@/lib/whatsapp";
import { getFunctionErrorMessage } from "@/lib/utils";
import { useOnlineStatus } from "@/lib/use-online-status";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function AiReplyDraftButton({
  storeId,
  phone,
  consentWhatsapp,
  clientName,
  garmentType,
  orderStatus,
  balance,
  deliveryDate,
}: {
  storeId: string;
  phone: string;
  consentWhatsapp: boolean;
  clientName: string;
  garmentType: string;
  orderStatus: string;
  balance: number;
  deliveryDate: string | null;
}) {
  const online = useOnlineStatus();
  const [open, setOpen] = useState(false);
  const [incoming, setIncoming] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-reply-draft", {
        body: {
          storeId,
          clientName,
          garmentType,
          orderStatus,
          balance,
          deliveryDate,
          incomingMessage: incoming.trim() || null,
          triggeredByUserAction: true,
        },
      });
      if (error) throw error;
      setDraft((data as { result: string }).result);
    } catch (error) {
      toast.error(await getFunctionErrorMessage(error, "Could not draft a reply"));
    } finally {
      setBusy(false);
    }
  }

  function send() {
    window.open(whatsappLink(phone, draft), "_blank", "noopener,noreferrer");
    setOpen(false);
  }

  if (!consentWhatsapp) return null;

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={!online}
        onClick={() => {
          setIncoming("");
          setDraft("");
          setOpen(true);
        }}
      >
        <Sparkles className="size-4" />
        AI draft reply
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Draft a WhatsApp reply</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>If you're replying to something they said</Label>
              <Textarea
                rows={2}
                value={incoming}
                onChange={(e) => setIncoming(e.target.value)}
                placeholder="Paste their message here (optional)"
              />
            </div>
            <Button type="button" onClick={generate} disabled={busy} className="w-full">
              {busy ? "Drafting..." : draft ? "Regenerate" : "Draft with AI"}
            </Button>
            {draft && (
              <div className="space-y-2">
                <Label>Edit before sending</Label>
                <Textarea rows={4} value={draft} onChange={(e) => setDraft(e.target.value)} />
                <Button type="button" className="w-full" onClick={send}>
                  <MessageCircle className="size-4" />
                  Send on WhatsApp
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">AI draft — review before sending.</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
