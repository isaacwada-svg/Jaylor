import { useState } from "react";
import { toast } from "sonner";
import { Link2, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/utils";
import { whatsappLink } from "@/lib/whatsapp";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * The everyday "remote individual" job: one client who can't come in gets a
 * self-measure link. Reuses the group-order engine (one job, one participant)
 * instead of a parallel flow, so it inherits the same guest page, styles,
 * status track and WhatsApp send that group orders already have.
 */
export function SendMeasureLinkButton({
  storeId,
  clientId,
  clientName,
  clientPhone,
}: {
  storeId: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
}) {
  const [open, setOpen] = useState(false);
  const [deposit, setDeposit] = useState("");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  function reset() {
    setDeposit("");
    setLink(null);
  }

  async function create() {
    setBusy(true);
    try {
      const { data: event, error: eventError } = await supabase
        .from("events")
        .insert({
          store_id: storeId,
          name: `Order for ${clientName}`,
          job_type: "remote_individual",
          payer_mode: "each_pays",
          collection_mode: "measurements",
          pricing_mode: "flat",
          deposit_amount: deposit.trim() ? Number(deposit) : null,
        })
        .select()
        .single();
      if (eventError) throw eventError;

      const { data: participant, error: participantError } = await supabase
        .from("event_participants")
        .insert({
          event_id: event.id,
          store_id: storeId,
          client_id: clientId,
          full_name: clientName,
          phone: clientPhone,
        })
        .select()
        .single();
      if (participantError) throw participantError;

      setLink(`${window.location.origin}/e/${participant.token}`);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not create the measure link"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        aria-label="Send measure link"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <Link2 className="size-4" />
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send measure link</DialogTitle>
          </DialogHeader>

          {link ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {clientName} can open this link to self-measure and confirm their order.
              </p>
              <div className="rounded-xl border border-border bg-accent/30 p-3 text-sm break-all">
                {link}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    navigator.clipboard
                      .writeText(link)
                      .then(() => toast.success("Link copied"))
                      .catch(() => toast.error("Could not copy link"));
                  }}
                >
                  Copy link
                </Button>
                <Button asChild className="flex-1">
                  <a
                    href={whatsappLink(
                      clientPhone,
                      `Hi ${clientName}, please use this link to send us your measurements: ${link}`,
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle className="size-4" />
                    Send
                  </a>
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="measure-link-deposit">Deposit (optional)</Label>
                <MoneyInput id="measure-link-deposit" value={deposit} onChange={setDeposit} />
              </div>
              <Button className="w-full" onClick={create} disabled={busy}>
                {busy ? "Creating..." : "Create link"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
