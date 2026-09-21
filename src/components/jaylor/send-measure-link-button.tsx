import { useState } from "react";
import { toast } from "sonner";
import { Link2, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/utils";
import { whatsappLink } from "@/lib/whatsapp";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/ui/money-input";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  const [isAbroad, setIsAbroad] = useState(false);
  const [deliveryCountry, setDeliveryCountry] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [shippingFee, setShippingFee] = useState("");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  function reset() {
    setDeposit("");
    setIsAbroad(false);
    setDeliveryCountry("");
    setDeliveryAddress("");
    setShippingFee("");
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
          job_type: isAbroad ? "diaspora" : "remote_individual",
          payer_mode: "each_pays",
          collection_mode: "measurements",
          pricing_mode: "flat",
          deposit_amount: deposit.trim() ? Number(deposit) : null,
          ...(isAbroad
            ? {
                delivery_country: deliveryCountry.trim() || null,
                delivery_address: deliveryAddress.trim() || null,
                shipping_fee: shippingFee.trim() ? Number(shippingFee) : null,
              }
            : {}),
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
              <div className="flex items-center justify-between rounded-xl border border-border p-3">
                <div>
                  <p className="text-sm font-medium">Client is abroad</p>
                  <p className="text-xs text-muted-foreground">Add a delivery address and fee</p>
                </div>
                <Switch checked={isAbroad} onCheckedChange={setIsAbroad} />
              </div>
              {isAbroad && (
                <div className="space-y-3 rounded-xl border border-border p-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="measure-link-country">Country</Label>
                      <Input
                        id="measure-link-country"
                        value={deliveryCountry}
                        onChange={(e) => setDeliveryCountry(e.target.value)}
                        placeholder="United Kingdom"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="measure-link-shipping">Shipping fee</Label>
                      <MoneyInput
                        id="measure-link-shipping"
                        value={shippingFee}
                        onChange={setShippingFee}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="measure-link-address">Delivery address</Label>
                    <Textarea
                      id="measure-link-address"
                      rows={2}
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                    />
                  </div>
                </div>
              )}
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
