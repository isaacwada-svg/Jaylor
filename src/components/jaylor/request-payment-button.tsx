import { useState } from "react";
import { toast } from "sonner";
import { CreditCard, MessageCircle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/utils";
import { whatsappLink } from "@/lib/whatsapp";
import { approximateUsd } from "@/lib/fx";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function RequestPaymentButton({
  orderId,
  defaultAmount,
  clientName,
  clientPhone,
}: {
  orderId: string;
  defaultAmount: number;
  clientName: string;
  clientPhone: string;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(Math.max(0, Math.round(defaultAmount))));
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [notConnected, setNotConnected] = useState(false);

  async function generate() {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.error("Enter an amount");
      return;
    }
    setBusy(true);
    setNotConnected(false);
    try {
      const callbackUrl = window.location.href.split("?")[0] ?? window.location.href;
      const { data, error } = await supabase.functions.invoke("create-order-payment", {
        body: { orderId, amount: amt, callbackUrl },
      });
      if (error) throw error;
      const { authorization_url } = data as { authorization_url: string };
      setLink(authorization_url);
    } catch (error) {
      const message = getErrorMessage(error, "Could not create a payment link");
      if (message.toLowerCase().includes("connect a bank account")) {
        setNotConnected(true);
      } else {
        toast.error(message);
      }
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setLink(null);
    setNotConnected(false);
    setAmount(String(Math.max(0, Math.round(defaultAmount))));
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <CreditCard className="size-4" />
        Request payment
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
            <DialogTitle>Request payment</DialogTitle>
          </DialogHeader>

          {notConnected ? (
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>Connect a bank account before sending payment links to clients.</p>
              <Button asChild className="w-full">
                <Link to="/billing">Go to Settings</Link>
              </Button>
            </div>
          ) : link ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-border bg-accent/30 p-3 text-sm break-all">
                {link}
              </div>
              <p className="text-xs text-muted-foreground">
                Clients abroad can pay by card in their own currency; it settles to you in naira.
              </p>
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
                {clientPhone && (
                  <Button asChild className="flex-1">
                    <a
                      href={whatsappLink(
                        clientPhone,
                        `Hi ${clientName}, here's a secure link to pay for your order: ${link}`,
                      )}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MessageCircle className="size-4" />
                      Send
                    </a>
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="request-amount">Amount</Label>
                <MoneyInput id="request-amount" value={amount} onChange={setAmount} />
                {Number(amount) > 0 && (
                  <p className="text-xs text-muted-foreground">
                    ≈ {approximateUsd(Number(amount))} for a client paying by card from abroad
                  </p>
                )}
              </div>
              <Button className="w-full" onClick={generate} disabled={busy}>
                {busy ? "Creating link..." : "Create payment link"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
