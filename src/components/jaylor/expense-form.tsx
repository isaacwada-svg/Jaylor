import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { getErrorMessage } from "@/lib/utils";
import { EXPENSE_CATEGORIES } from "@/lib/jaylor";
import { useOnlineStatus } from "@/lib/use-online-status";
import { OfflineNotice } from "@/components/jaylor/offline-notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function ExpenseForm({
  open,
  onOpenChange,
  storeId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  onSaved: () => void;
}) {
  const isMobile = useIsMobile();
  const online = useOnlineStatus();
  const [category, setCategory] = useState("fabric");
  const [amount, setAmount] = useState("");
  const [spentAt, setSpentAt] = useState(todayISO());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCategory("fabric");
    setAmount("");
    setSpentAt(todayISO());
    setNote("");
  }, [open]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("expenses").insert({
        store_id: storeId,
        category,
        amount: Number(amount) || 0,
        spent_at: spentAt,
        note: note.trim() || null,
        created_by: userData.user?.id ?? null,
      });
      if (error) throw error;
      toast.success("Expense added");
      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not add this expense"));
    } finally {
      setBusy(false);
    }
  }

  const body = (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Category</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EXPENSE_CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="expense-amount">Amount</Label>
          <MoneyInput id="expense-amount" value={amount} onChange={setAmount} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="expense-date">Date</Label>
          <Input
            id="expense-date"
            type="date"
            value={spentAt}
            onChange={(e) => setSpentAt(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="expense-note">Note</Label>
        <Textarea
          id="expense-note"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      {!online && <OfflineNotice />}
      <Button type="submit" className="w-full" disabled={busy || !amount.trim() || !online}>
        {busy ? "Saving..." : "Add expense"}
      </Button>
    </form>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader className="text-left">
            <SheetTitle className="text-2xl">Add expense</SheetTitle>
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
          <DialogTitle>Add expense</DialogTitle>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
