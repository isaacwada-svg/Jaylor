import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MoneyText } from "@/components/jaylor/money-text";

type Method = "cash" | "transfer" | "pos" | "paystack";

export function PaymentForm({
  open,
  onOpenChange,
  orderId,
  storeId,
  balance,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  storeId: string;
  balance: number;
  onSaved: () => void;
}) {
  const isMobile = useIsMobile();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Method>("cash");
  const [reference, setReference] = useState("");
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAmount("");
    setMethod("cash");
    setReference("");
    setPaidAt(new Date().toISOString().slice(0, 10));
  }, [open]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.error("Enter an amount");
      return;
    }
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("payments").insert({
        store_id: storeId,
        order_id: orderId,
        amount: amt,
        method,
        reference: reference.trim() || null,
        received_by: userData.user?.id ?? null,
        paid_at: new Date(paidAt).toISOString(),
      });
      if (error) throw error;
      toast.success("Payment recorded");
      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not record this payment"));
    } finally {
      setBusy(false);
    }
  }

  const body = (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setAmount(String(balance))}
          disabled={balance <= 0}
        >
          Full balance
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setAmount(String(Math.round(balance / 2)))}
          disabled={balance <= 0}
        >
          Half
        </Button>
      </div>
      <div className="space-y-2">
        <Label htmlFor="payment-amount">Amount</Label>
        <Input
          id="payment-amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label>Method</Label>
        <Select value={method} onValueChange={(v) => setMethod(v as Method)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cash">Cash</SelectItem>
            <SelectItem value="transfer">Transfer</SelectItem>
            <SelectItem value="pos">POS</SelectItem>
            <SelectItem value="paystack">Paystack</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="payment-date">Date</Label>
          <Input
            id="payment-date"
            type="date"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="payment-reference">Reference</Label>
          <Input
            id="payment-reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </div>
      </div>
      {amount && (
        <p className="text-sm text-muted-foreground">
          New balance: <MoneyText amount={Math.max(balance - (Number(amount) || 0), 0)} />
        </p>
      )}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Saving..." : "Record payment"}
      </Button>
    </form>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader className="text-left">
            <SheetTitle className="text-2xl">Record payment</SheetTitle>
          </SheetHeader>
          <div className="mt-2 pb-4">{body}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
