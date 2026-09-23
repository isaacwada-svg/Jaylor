import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  GARMENT_TYPES,
  GARMENT_TYPE_CODE_BY_NAME,
  computeAgeGroup,
  computeTemplateSex,
  formatMoney,
  planCodeToTier,
} from "@/lib/jaylor";
import { isBridalRemeasureDue, pickDefaultTemplate } from "@/lib/measurements";
import { MeasurementForm } from "@/components/jaylor/measurements-tab";
import { estimateFabricYards, FABRIC_PATTERNS, type FabricPattern } from "@/lib/fabric-formulas";
import { formatPhoneNG } from "@/lib/phone";
import { getErrorMessage, cn } from "@/lib/utils";
import { useFeature } from "@/lib/use-feature";
import { enqueue, isNetworkFailure } from "@/lib/offline/outbox";
import { useOnlineStatus } from "@/lib/use-online-status";
import { FeatureLimitSheet } from "@/components/jaylor/feature-limit-sheet";
import { PaymentReliabilityBadge } from "@/components/jaylor/payment-reliability-badge";
import { PriceGuidancePanel } from "@/components/jaylor/price-guidance-panel";
import { OfflineNotice } from "@/components/jaylor/offline-notice";
import { HelpTooltip } from "@/components/jaylor/help-tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { StitchTrack } from "@/components/jaylor/stitch-track";
import { StitchDivider } from "@/components/jaylor/stitch-divider";

type ClientRow = Tables<"clients">;
type OrderRow = Tables<"orders">;

const STEPS = ["Client", "Garment", "Measurements", "Material", "Price & review"] as const;

export type OrderPrefill = {
  garment_type: string | null;
  quantity: number | null;
  style_notes: string | null;
  price: number | null;
  delivery_date: string | null;
  rush: boolean | null;
};

export function OrderForm({
  open,
  onOpenChange,
  storeId,
  initialClient,
  prefill,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  initialClient?: ClientRow | null;
  prefill?: OrderPrefill | null;
  onSaved: (order: OrderRow) => void;
}) {
  const isMobile = useIsMobile();
  const online = useOnlineStatus();
  const queryClient = useQueryClient();
  const { data: ordersFeature } = useFeature(open ? storeId : undefined, "orders");
  const [step, setStep] = useState(0);

  const [clientSearch, setClientSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<ClientRow | null>(null);

  const [garmentType, setGarmentType] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [styleNotes, setStyleNotes] = useState("");

  const [measurementSetId, setMeasurementSetId] = useState("");
  const [measurementMode, setMeasurementMode] = useState<"reuse" | "new">("reuse");
  const [measurementPromptOpen, setMeasurementPromptOpen] = useState(false);
  const [promptedForClientId, setPromptedForClientId] = useState<string | null>(null);

  const [materialSource, setMaterialSource] = useState<"customer" | "tailor">("customer");
  const [materialDescription, setMaterialDescription] = useState("");
  const [materialColour, setMaterialColour] = useState("");
  const [materialYards, setMaterialYards] = useState("");
  const [materialCost, setMaterialCost] = useState("");
  const [fabricWidth, setFabricWidth] = useState("45");
  const [fabricPattern, setFabricPattern] = useState<FabricPattern>("plain");
  const [estimatingFabric, setEstimatingFabric] = useState(false);
  const [fabricNote, setFabricNote] = useState<string | null>(null);

  const [price, setPrice] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [rush, setRush] = useState(false);

  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep(initialClient ? 1 : 0);
    setClientSearch("");
    setSelectedClient(initialClient ?? null);
    setGarmentType(prefill?.garment_type ?? "");
    setQuantity(prefill?.quantity ? String(prefill.quantity) : "1");
    setStyleNotes(prefill?.style_notes ?? "");
    setMeasurementSetId("");
    setMeasurementMode("reuse");
    setPromptedForClientId(null);
    setMeasurementPromptOpen(false);
    setMaterialSource("customer");
    setMaterialDescription("");
    setMaterialColour("");
    setMaterialYards("");
    setMaterialCost("");
    setPrice(prefill?.price != null ? String(prefill.price) : "");
    setDeliveryDate(prefill?.delivery_date ?? "");
    setRush(prefill?.rush ?? false);
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
    retry: false,
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
    retry: false,
  });

  const { data: measurementTemplates } = useQuery({
    queryKey: ["order-form-measurement-templates", storeId],
    enabled: !!selectedClient,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("measurement_templates")
        .select("*")
        .eq("store_id", storeId)
        .eq("hidden", false);
      if (error) throw error;
      return data;
    },
    retry: false,
  });

  useEffect(() => {
    const latest = measurementSets?.[0];
    if (latest && !measurementSetId) setMeasurementSetId(latest.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measurementSets]);

  useEffect(() => {
    if (!selectedClient || !measurementSets) return;
    if (measurementSets.length === 0) return;
    if (promptedForClientId === selectedClient.id) return;
    setPromptedForClientId(selectedClient.id);
    setMeasurementPromptOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClient, measurementSets]);

  function reuseExistingMeasurements() {
    setMeasurementMode("reuse");
    setMeasurementPromptOpen(false);
  }

  function takeNewMeasurements() {
    setMeasurementMode("new");
    setMeasurementSetId("");
    setMeasurementPromptOpen(false);
  }

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

  async function suggestPrice() {
    if (!garmentType) return;
    setSuggesting(true);
    setSuggestion(null);
    try {
      const { data: pastOrders, error } = await supabase
        .from("orders")
        .select("id, price")
        .eq("store_id", storeId)
        .eq("garment_type", garmentType)
        .limit(50);
      if (error) throw error;

      const prices = (pastOrders ?? [])
        .map((o) => o.price)
        .filter((p): p is number => typeof p === "number" && p > 0);
      if (prices.length === 0) {
        toast.error("No pricing history yet for this garment type");
        return;
      }

      const orderIds = (pastOrders ?? []).map((o) => o.id);
      const { data: materials } = await supabase
        .from("order_materials")
        .select("yards")
        .in("order_id", orderIds);
      const yardsList = (materials ?? [])
        .map((m) => m.yards)
        .filter((y): y is number => typeof y === "number" && y > 0);

      const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const avgYards = yardsList.length
        ? yardsList.reduce((a, b) => a + b, 0) / yardsList.length
        : null;

      // Plain arithmetic on this shop's own history — no AI call, per the
      // cost-control rule that pricing guidance must be arithmetic only.
      const RUSH_PREMIUM = 1.15;
      const qty = Number(quantity) || 1;
      const suggested = Math.round((rush ? avgPrice * RUSH_PREMIUM : avgPrice) / 500) * 500;

      const count = prices.length;
      let text = `Based on ${count} past ${garmentType} order${count === 1 ? "" : "s"}, you usually charge ${formatMoney(avgPrice)} (range ${formatMoney(minPrice)}–${formatMoney(maxPrice)}).`;
      if (rush) {
        text += ` For a rush order, consider around ${formatMoney(suggested)}.`;
      }
      if (avgYards != null) {
        text += ` You typically use about ${(avgYards * qty).toFixed(1)} yards for this quantity.`;
      }
      text += " This is a suggestion from your own history — review before confirming.";
      setSuggestion(text);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not suggest a price"));
    } finally {
      setSuggesting(false);
    }
  }

  async function estimateFabric() {
    if (!garmentType) return;
    setEstimatingFabric(true);
    setFabricNote(null);
    try {
      const { data: pastOrders, error } = await supabase
        .from("orders")
        .select("id")
        .eq("store_id", storeId)
        .eq("garment_type", garmentType)
        .limit(50);
      if (error) throw error;

      const orderIds = (pastOrders ?? []).map((o) => o.id);
      const { data: materials } = orderIds.length
        ? await supabase.from("order_materials").select("yards").in("order_id", orderIds)
        : { data: [] };
      const yardsList = (materials ?? [])
        .map((m) => m.yards)
        .filter((y): y is number => typeof y === "number" && y > 0);
      const storeAverage = yardsList.length
        ? yardsList.reduce((a, b) => a + b, 0) / yardsList.length
        : null;

      const estimate = estimateFabricYards({
        garmentType,
        quantity: Number(quantity) || 1,
        fabricWidth: Number(fabricWidth) || 45,
        pattern: fabricPattern,
        storeAverage,
        storeAverageCount: yardsList.length,
      });

      setMaterialYards(String(estimate.suggestedPurchase));
      setFabricNote(
        estimate.source === "history"
          ? `Based on this shop's own past ${garmentType} orders (${estimate.perPiece.toFixed(1)} yards each). Includes 10% waste allowance.`
          : `Estimate from a standard formula for ${garmentType} — no order history yet for this garment type. Includes 10% waste allowance.`,
      );
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not estimate fabric"));
    } finally {
      setEstimatingFabric(false);
    }
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!selectedClient) return;
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const orderPayload = {
        store_id: storeId,
        // Placeholder only — the orders_set_number trigger assigns the real number on insert.
        number: "",
        client_id: selectedClient.id,
        garment_type: garmentType,
        garment_type_code: GARMENT_TYPE_CODE_BY_NAME[garmentType] ?? null,
        style_notes: styleNotes.trim() || null,
        measurement_set_id: measurementSetId || null,
        quantity: Number(quantity) || 1,
        price: Number(price) || 0,
        delivery_date: deliveryDate || null,
        // No separate instalment schedule exists yet — the balance is expected
        // by delivery, so that date doubles as the payment-reliability due date.
        balance_due_date: deliveryDate || null,
        priority: rush ? "rush" : "normal",
        created_by: userData.user?.id ?? null,
      };
      const materialYardsNum = materialYards.trim() ? Number(materialYards) : null;
      const materialCostNum = materialSource === "tailor" ? Number(materialCost) || 0 : 0;
      const materialPayload = {
        store_id: storeId,
        source: materialSource,
        description: materialDescription.trim(),
        colour: materialColour.trim() || null,
        yards: materialYardsNum,
        cost: materialCostNum,
        cost_per_yard:
          materialSource === "tailor" && materialYardsNum && materialYardsNum > 0
            ? materialCostNum / materialYardsNum
            : null,
      };

      if (!online) {
        await enqueue({
          kind: "order.create",
          storeId,
          label: `New order: ${garmentType} for ${selectedClient.full_name}`,
          payload: { order: orderPayload, material: materialPayload },
        });
        toast.success("Saved offline — will sync when you're back online");
        onOpenChange(false);
        return;
      }

      try {
        const { data: order, error } = await supabase
          .from("orders")
          .insert(orderPayload)
          .select()
          .single();
        if (error) throw error;

        const { error: materialError } = await supabase
          .from("order_materials")
          .insert({ ...materialPayload, order_id: order.id });
        if (materialError) throw materialError;

        toast.success(`Order ${order.number} created`);
        onSaved(order);
      } catch (error) {
        if (!isNetworkFailure(error)) throw error;
        await enqueue({
          kind: "order.create",
          storeId,
          label: `New order: ${garmentType} for ${selectedClient.full_name}`,
          payload: { order: orderPayload, material: materialPayload },
        });
        toast.success("Saved offline — will sync when you're back online");
      }
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
          ) : !online ? (
            <OfflineNotice label="Searching clients needs an internet connection. Open this from the client's own profile instead." />
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
          {selectedClient && (
            <PaymentReliabilityBadge clientId={selectedClient.id} showDepositHint />
          )}
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

      {step === 2 && selectedClient && measurementMode === "new" ? (
        <MeasurementForm
          client={selectedClient}
          templates={measurementTemplates ?? []}
          defaultTemplateId={
            pickDefaultTemplate(
              measurementTemplates ?? [],
              computeAgeGroup(selectedClient.birthday),
              computeTemplateSex(selectedClient.gender),
            )?.id
          }
          previous={measurementSets?.[0]}
          onCancel={() => setMeasurementMode("reuse")}
          onSaved={() => {
            queryClient.invalidateQueries({
              queryKey: ["order-form-measurement-sets", selectedClient.id],
            });
            setMeasurementSetId("");
            setMeasurementMode("reuse");
          }}
        />
      ) : (
        step === 2 && (
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
                <button
                  type="button"
                  onClick={takeNewMeasurements}
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                >
                  Take new measurements instead
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {selectedClient?.full_name} has no measurements yet.
                </p>
                <Button type="button" variant="outline" size="sm" onClick={takeNewMeasurements}>
                  Take measurements now
                </Button>
              </div>
            )}
          </div>
        )
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

          {garmentType && (
            <div className="space-y-3 rounded-xl border border-border p-3">
              <p className="text-sm font-medium">Not sure how much fabric to buy?</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="fabric-width">Fabric width (inches)</Label>
                  <Input
                    id="fabric-width"
                    inputMode="decimal"
                    value={fabricWidth}
                    onChange={(e) => setFabricWidth(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fabric-pattern">Pattern</Label>
                  <Select
                    value={fabricPattern}
                    onValueChange={(v) => setFabricPattern(v as FabricPattern)}
                  >
                    <SelectTrigger id="fabric-pattern">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FABRIC_PATTERNS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={estimateFabric}
                disabled={estimatingFabric || !online}
              >
                {estimatingFabric ? "Calculating..." : "Estimate fabric needed"}
              </Button>
              {fabricNote && <p className="text-xs text-muted-foreground">{fabricNote}</p>}
            </div>
          )}
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

          {garmentType === "Bridal" &&
            deliveryDate &&
            (() => {
              const chosenSet = measurementSets?.find((s) => s.id === measurementSetId);
              if (!chosenSet || !isBridalRemeasureDue(chosenSet.taken_at, deliveryDate)) {
                return null;
              }
              return (
                <p className="rounded-xl border border-owed/40 bg-owed/10 p-3 text-sm">
                  These measurements were taken more than 3 months before the wedding date. A
                  bride&apos;s measurements can change — take a fresh set or book another fitting
                  before this order goes into production.
                </p>
              );
            })()}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={suggestPrice}
            disabled={suggesting || !online}
          >
            {suggesting ? "Checking..." : "Suggest a price"}
          </Button>
          {suggestion && (
            <p className="rounded-xl border border-gold/30 bg-accent/30 p-3 text-sm text-muted-foreground">
              {suggestion}
            </p>
          )}
          {!online && <OfflineNotice label="Price suggestions need an internet connection." />}

          {online && (
            <PriceGuidancePanel
              storeId={storeId}
              garmentTypeCode={GARMENT_TYPE_CODE_BY_NAME[garmentType] ?? null}
              currentPrice={price.trim() ? Number(price) : null}
            />
          )}

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

  const measurementPrompt = (
    <Dialog open={measurementPromptOpen} onOpenChange={setMeasurementPromptOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Use {selectedClient?.full_name}&apos;s existing measurements?</DialogTitle>
          <DialogDescription>
            {measurementSets?.[0] &&
              `Latest set: v${measurementSets[0].version}, taken ${new Date(measurementSets[0].taken_at).toLocaleDateString()}.`}{" "}
            You can reuse these, or take a fresh set for this order.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button className="w-full" onClick={reuseExistingMeasurements}>
            Use existing measurements
          </Button>
          <Button className="w-full" variant="outline" onClick={takeNewMeasurements}>
            Take new measurements
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (isMobile) {
    return (
      <>
        <Sheet open={open} onOpenChange={onOpenChange}>
          <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl">
            <SheetHeader className="text-left">
              <SheetTitle className="flex items-center gap-2 text-2xl">
                New order
                <HelpTooltip>
                  Pick a client and garment, then add measurements and a price. Balances and due
                  dates update automatically as you record payments.
                </HelpTooltip>
              </SheetTitle>
            </SheetHeader>
            <div className="mt-2 pb-4">{body}</div>
          </SheetContent>
        </Sheet>
        {measurementPrompt}
      </>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              New order
              <HelpTooltip>
                Pick a client and garment, then add measurements and a price. Balances and due dates
                update automatically as you record payments.
              </HelpTooltip>
            </DialogTitle>
          </DialogHeader>
          {body}
        </DialogContent>
      </Dialog>
      {measurementPrompt}
    </>
  );
}
