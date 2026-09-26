import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { GARMENT_TYPES, GARMENT_TYPE_CODE_BY_NAME } from "@/lib/jaylor";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Quote = Tables<"quotes">;
type ClientRow = { id: string; full_name: string; phone: string };

export function QuoteForm({
  open,
  onOpenChange,
  storeId,
  quote,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  quote?: Quote | null;
  onSaved?: (quote: Quote) => void;
}) {
  const queryClient = useQueryClient();
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<ClientRow | null>(null);
  const [garmentType, setGarmentType] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [discountPercent, setDiscountPercent] = useState("0");
  const [validDays, setValidDays] = useState("7");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (quote) {
      setGarmentType(quote.garment_type);
      setQuantity(String(quote.quantity));
      setUnitPrice(String(quote.unit_price));
      setDiscountPercent(String(quote.discount_percent));
      setNotes(quote.notes ?? "");
      const days = Math.max(
        1,
        Math.round((new Date(quote.valid_until).getTime() - Date.now()) / 86_400_000),
      );
      setValidDays(String(days));
      setSelectedClient(null);
      setClientSearch("");
    } else {
      setGarmentType("");
      setQuantity("1");
      setUnitPrice("");
      setDiscountPercent("0");
      setValidDays("7");
      setNotes("");
      setSelectedClient(null);
      setClientSearch("");
    }
  }, [open, quote]);

  const { data: clientResults } = useQuery({
    queryKey: ["quote-client-search", storeId, clientSearch],
    enabled: !selectedClient && clientSearch.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, full_name, phone")
        .eq("store_id", storeId)
        .or(`full_name.ilike.%${clientSearch}%,phone.ilike.%${clientSearch}%`)
        .limit(8);
      if (error) throw error;
      return data as ClientRow[];
    },
  });

  const { data: existingClient } = useQuery({
    queryKey: ["quote-existing-client", quote?.client_id],
    enabled: !!quote?.client_id && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, full_name, phone")
        .eq("id", quote!.client_id)
        .single();
      if (error) throw error;
      return data as ClientRow;
    },
  });

  const activeClient = selectedClient ?? (quote ? existingClient : null);

  async function submit() {
    if (!activeClient) {
      toast.error("Choose a client for this quote");
      return;
    }
    if (!garmentType) {
      toast.error("Choose what this quote is for");
      return;
    }
    const qty = Math.max(1, Math.round(Number(quantity)) || 1);
    const price = Number(unitPrice) || 0;
    const discount = Math.min(100, Math.max(0, Number(discountPercent) || 0));
    const days = Math.max(1, Math.round(Number(validDays)) || 7);
    if (price <= 0) {
      toast.error("Enter a price");
      return;
    }

    setBusy(true);
    try {
      const payload = {
        store_id: storeId,
        client_id: activeClient.id,
        garment_type: garmentType,
        garment_type_code: GARMENT_TYPE_CODE_BY_NAME[garmentType] ?? null,
        quantity: qty,
        unit_price: price,
        discount_percent: discount,
        notes: notes.trim() || null,
        valid_until: new Date(Date.now() + days * 86_400_000).toISOString(),
      };

      if (quote) {
        const { data, error } = await supabase
          .from("quotes")
          .update(payload)
          .eq("id", quote.id)
          .select()
          .single();
        if (error) throw error;
        toast.success("Quote updated");
        onSaved?.(data);
      } else {
        const { data, error } = await supabase.from("quotes").insert(payload).select().single();
        if (error) throw error;
        toast.success("Quote created");
        onSaved?.(data);
      }
      queryClient.invalidateQueries({ queryKey: ["quotes", storeId] });
      onOpenChange(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not save this quote"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{quote ? "Edit quote" : "New quote"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Client</Label>
            {activeClient ? (
              <div className="flex items-center justify-between rounded-xl border border-border p-3">
                <div>
                  <p className="font-medium">{activeClient.full_name}</p>
                  <p className="text-sm text-muted-foreground">{activeClient.phone}</p>
                </div>
                {!quote && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedClient(null);
                      setClientSearch("");
                    }}
                  >
                    Change
                  </Button>
                )}
              </div>
            ) : (
              <>
                <Input
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder="Search by name or phone"
                />
                {(clientResults ?? []).length > 0 && (
                  <div className="space-y-1 rounded-xl border border-border p-1">
                    {clientResults!.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-accent/60"
                        onClick={() => setSelectedClient(c)}
                      >
                        <span>{c.full_name}</span>
                        <span className="text-muted-foreground">{c.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label>What's this for?</Label>
            <Select value={garmentType} onValueChange={setGarmentType}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a garment type" />
              </SelectTrigger>
              <SelectContent>
                {GARMENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="quote-quantity">Quantity</Label>
              <Input
                id="quote-quantity"
                type="number"
                min={1}
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quote-price">Price per piece (₦)</Label>
              <MoneyInput id="quote-price" value={unitPrice} onChange={setUnitPrice} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="quote-discount">Discount (%)</Label>
              <Input
                id="quote-discount"
                type="number"
                min={0}
                max={100}
                inputMode="numeric"
                value={discountPercent}
                onChange={(e) => setDiscountPercent(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quote-valid-days">Valid for (days)</Label>
              <Input
                id="quote-valid-days"
                type="number"
                min={1}
                inputMode="numeric"
                value={validDays}
                onChange={(e) => setValidDays(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quote-notes">Notes (optional)</Label>
            <Textarea
              id="quote-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Fabric, style details, anything the client should see"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={submit} disabled={busy} className="w-full">
            {busy ? "Saving..." : quote ? "Save changes" : "Create quote"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
