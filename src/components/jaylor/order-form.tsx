import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useIsMobile } from "@/hooks/use-mobile";
import { GARMENT_TYPES, formatMoney, planCodeToTier } from "@/lib/jaylor";
import { formatPhoneNG } from "@/lib/phone";
import { getErrorMessage, cn } from "@/lib/utils";
import { useFeature } from "@/lib/use-feature";
import { FeatureLimitSheet } from "@/components/jaylor/feature-limit-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StitchTrack } from "@/components/jaylor/stitch-track";
import { StitchDivider } from "@/components/jaylor/stitch-divider";

type ClientRow = Tables<"clients">;
type OrderRow = Tables<"orders">;

const STEPS = ["Client", "Garment", "Measurements", "Material", "Price & review"] as const;

export function OrderForm({
  open,
  onOpenChange,
  storeId,
  initialClient,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  initialClient?: ClientRow | null;
  onSaved: (order: OrderRow) => void;
}) {
  const isMobile = useIsMobile();
  const { data: ordersFeature } = useFeature(open ? storeId : undefined, "orders");
  const [step, setStep] = useState(0);

  const [clientSearch, setClientSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<ClientRow | null>(null);

  const [garmentType, setGarmentType] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [styleNotes, setStyleNotes] = useState("");

  const [measurementSetId, setMeasurementSetId] = useState("");

  const [materialSource, setMaterialSource] = useState<"customer" | "tailor">("customer");
  const [materialDescription, setMaterialDescription] = useState("");
  const [materialColour, setMaterialColour] = useState("");
  const [materialYards, setMaterialYards] = useState("");
  const [materialCost, setMaterialCost] = useState("");

  const [price, setPrice] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [rush, setRush] = useState(false);

  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(initialClient ? 1 : 0);
    setClientSearch("");
    setSelectedClient(initialClient ?? null);
    setGarmentType("");
    setQuantity("1");
    setStyleNotes("");
    setMeasurementSetId("");
    setMaterialSource("customer");
    setMaterialDescription("");
    setMaterialColour("");
    setMaterialYards("");
    setMaterialCost("");
    setPrice("");
    setDeliveryDate("");
    setRush(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const { data: clientResults } = useQuery({
    queryKey: ["order-form-clients", storeId, clientSearch],
    enabled: open && step === 0 && clientSearch.trim().length > 0,
    queryFn: async () => {
      const term = clientSearch.trim().replace(/"/g, '\\"');
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("store_id", storeId)
        .or(`full_name.ilike."%${term}%",phone.ilike."%${term}%"`)
        .limit(10);
      if (error) throw error;
      return data;
    },
  });

  const { data: measurementSets } = useQuery({
    queryKey: ["order-form-measurement-sets", selectedClient?.id],
    enabled: !!selectedClient,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("measurement_sets")
        .select("*")
        .eq("client_id", selectedClient?.id as string)
        .order("version", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const latest = measurementSets?.[0];
    if (latest && !measurementSetId) setMeasurementSetId(latest.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measurementSets]);

  function next() {
    if (step === 0 && !selectedClient) {
      toast.error("Pick a client first");
      return;
    }
    if (step === 1 && !garmentType) {
      toast.error("Choose a garment type");
      return;
    }
    if (step === 3) {
      if (!materialDescription.trim()) {
        toast.error(
          materialSource === "customer"
            ? "Describe the fabric the customer brought"
            : "Describe the fabric you'll buy",
        );
        return;
      }
      if (materialSource === "tailor" && !materialCost.trim()) {
        toast.error("Enter the estimated fabric cost");
        return;
      }
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function back() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!selectedClient) return;
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { data: order, error } = await supabase
        .from("orders")
        .insert({
          store_id: storeId,
          client_id: selectedClient.id,
          garment_type: garmentType,
          style_notes: styleNotes.trim() || null,
          measurement_set_id: measurementSetId || null,
          quantity: Number(quantity) || 1,
          price: Number(price) || 0,
          delivery_date: deliveryDate || null,
          priority: rush ? "rush" : "normal",
          created_by: userData.user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;

      const { error: materialError } = await supabase.from("order_materials").insert({
        order_id: order.id,
        store_id: storeId,
        source: materialSource,
        description: materialDescription.trim(),
        colour: materialColour.trim() || null,
        yards: materialYards.trim() ? Number(materialYards) : null,
        cost: materialSource === "tailor" ? Number(materialCost) || 0 : 0,
      });
      if (materialError) throw materialError;

      toast.success(`Order ${order.number} created`);
      onSaved(order);
      onOpenChange(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not create this order"));
    } finally {
      setBusy(false);
    }
  }

  const body = (
    <div className="space-y-5">
      <StitchTrack steps={STEPS} currentIndex={step} compact />

      {step === 0 && (
        <div className="space-y-3">
          <Label htmlFor="order-client-search">Client</Label>
          {selectedClient ? (
            <div className="flex items-center justify-between rounded-xl border border-border p-3">
              <div>
                <p className="font-medium">{selectedClient.full_name}</p>
                <p className="figures text-sm text-muted-foreground">
                  {formatPhoneNG(selectedClient.phone)}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelectedClient(null)}
              >
                Change
              </Button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="order-client-search"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder="Search name or phone"
                  className="pl-9"
                />
              </div>
              {clientResults && clientResults.length > 0 && (
                <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-border p-1">
                  {clientResults.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setSelectedClient(c);
                        setMeasurementSetId("");
                      }}
                      className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-accent/60"
                    >
                      <Avatar className="size-8">
                        <AvatarFallback>{c.full_name.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{c.full_name}</p>
                        <p className="figures truncate text-xs text-muted-foreground">
                          {formatPhoneNG(c.phone)}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {clientSearch.trim() && clientResults?.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No clients match. Add them from the Clients page first.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Garment</Label>
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
          <div className="space-y-2">
            <Label htmlFor="order-quantity">Quantity</Label>
            <Input
              id="order-quantity"
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="order-style-notes">Style notes</Label>
            <Textarea
              id="order-style-notes"
              rows={3}
              value={styleNotes}
              onChange={(e) => setStyleNotes(e.target.value)}
              placeholder="Neckline, sleeve style, references..."
            />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          {measurementSets && measurementSets.length > 0 ? (
            <div className="space-y-2">
              <Label>Measurement set</Label>
              <Select value={measurementSetId} onValueChange={setMeasurementSetId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {measurementSets.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      v{s.version} · {new Date(s.taken_at).toLocaleDateString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {selectedClient?.full_name} has no measurements yet. You can add them from their
              profile after creating this order, or leave this blank for now.
            </p>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="flex gap-2">
            {(["customer", "tailor"] as const).map((source) => (
              <button
                key={source}
                type="button"
                onClick={() => setMaterialSource(source)}
                className={cn(
                  "flex-1 rounded-xl border px-3 py-3 text-left text-sm",
                  materialSource === source
                    ? "border-gold bg-accent"
                    : "border-border text-muted-foreground",
                )}
              >
                <span className="block font-medium text-foreground">
                  {source === "customer" ? "Customer brings fabric" : "I will buy the fabric"}
                </span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="material-description">
                {materialSource === "customer" ? "Fabric description *" : "What you'll buy *"}
              </Label>
              <Input
                id="material-description"
                value={materialDescription}
                onChange={(e) => setMaterialDescription(e.target.value)}
                placeholder="e.g. Ankara, lace..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="material-colour">Colour</Label>
              <Input
                id="material-colour"
                value={materialColour}
                onChange={(e) => setMaterialColour(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="material-yards">Yards</Label>
              <Input
                id="material-yards"
                inputMode="decimal"
                value={materialYards}
                onChange={(e) => setMaterialYards(e.target.value)}
              />
            </div>
            {materialSource === "tailor" && (
              <div className="col-span-2 space-y-2">
                <Label htmlFor="material-cost">Estimated cost (added to the bill) *</Label>
                <MoneyInput id="material-cost" value={materialCost} onChange={setMaterialCost} />
              </div>
            )}
          </div>
        </div>
      )}

      {step === 4 && (
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="order-price">Price</Label>
              <MoneyInput id="order-price" value={price} onChange={setPrice} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="order-delivery-date">Delivery date</Label>
              <Input
                id="order-delivery-date"
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
              />
            </div>
          </div>
          <label className="flex items-center justify-between rounded-xl border border-border p-3">
            <span className="text-sm">Rush order</span>
            <Switch checked={rush} onCheckedChange={setRush} />
          </label>

          <StitchDivider />

          <div className="space-y-1 text-sm">
            <p className="font-medium">Review</p>
            <p className="text-muted-foreground">
              {selectedClient?.full_name} · {garmentType} × {quantity}
            </p>
            <p className="text-muted-foreground">
              {materialSource === "customer" ? "Customer's fabric" : "Store-bought fabric"}:{" "}
              {materialDescription}
            </p>
            {price && <p className="text-muted-foreground">Price: {formatMoney(Number(price))}</p>}
          </div>

          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={back} disabled={busy}>
              Back
            </Button>
            <Button type="submit" className="flex-1" disabled={busy}>
              {busy ? "Creating..." : "Create order"}
            </Button>
          </div>
        </form>
      )}

      {step < 4 && (
        <div className="flex gap-2">
          {step > 0 && (
            <Button type="button" variant="outline" onClick={back}>
              Back
            </Button>
          )}
          <Button type="button" className="flex-1" onClick={next}>
            Continue
          </Button>
        </div>
      )}
    </div>
  );

  if (open && ordersFeature && !ordersFeature.allowed) {
    return (
      <FeatureLimitSheet
        open={open}
        onOpenChange={onOpenChange}
        requiredTier={planCodeToTier(ordersFeature.required_plan ?? "growth")}
        message="You've reached your monthly order limit. Growth gives you unlimited orders."
      />
    );
  }

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="text-left">
            <SheetTitle className="text-2xl">New order</SheetTitle>
          </SheetHeader>
          <div className="mt-2 pb-4">{body}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New order</DialogTitle>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
