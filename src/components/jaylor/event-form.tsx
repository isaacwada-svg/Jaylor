import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useIsMobile } from "@/hooks/use-mobile";
import { getErrorMessage } from "@/lib/utils";
import { useOnlineStatus } from "@/lib/use-online-status";
import { JOB_TEMPLATES, type JobTemplate } from "@/lib/job-templates";
import { OfflineNotice } from "@/components/jaylor/offline-notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type EventRow = Tables<"events">;

type StyleRow = { key: string; label: string; price: string };
type SizeRow = { key: string; label: string; chest: string; waist: string; length: string };
type TierRow = { minQty: string; maxQty: string; price: string };

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function EventForm({
  open,
  onOpenChange,
  storeId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  onSaved: (event: EventRow) => void;
}) {
  const isMobile = useIsMobile();
  const online = useOnlineStatus();

  const [template, setTemplate] = useState<JobTemplate | null>(null);
  const [name, setName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [organiserName, setOrganiserName] = useState("");
  const [organiserPhone, setOrganiserPhone] = useState("");
  const [fabricDescription, setFabricDescription] = useState("");
  const [pricePerPerson, setPricePerPerson] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [measurementDeadline, setMeasurementDeadline] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [styles, setStyles] = useState<StyleRow[]>([{ key: "", label: "", price: "" }]);
  const [sizes, setSizes] = useState<SizeRow[]>([
    { key: "", label: "", chest: "", waist: "", length: "" },
  ]);
  const [tiers, setTiers] = useState<TierRow[]>([{ minQty: "1", maxQty: "", price: "" }]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTemplate(null);
    setName("");
    setEventDate("");
    setOrganiserName("");
    setOrganiserPhone("");
    setFabricDescription("");
    setPricePerPerson("");
    setDepositAmount("");
    setMeasurementDeadline("");
    setDeliveryDate("");
    setStyles([{ key: "", label: "", price: "" }]);
    setSizes([{ key: "", label: "", chest: "", waist: "", length: "" }]);
    setTiers([{ minQty: "1", maxQty: "", price: "" }]);
  }, [open]);

  function updateStyle(index: number, patch: Partial<StyleRow>) {
    setStyles((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addStyleRow() {
    setStyles((prev) => [...prev, { key: "", label: "", price: "" }]);
  }

  function removeStyleRow(index: number) {
    setStyles((prev) => prev.filter((_, i) => i !== index));
  }

  function updateSize(index: number, patch: Partial<SizeRow>) {
    setSizes((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addSizeRow() {
    setSizes((prev) => [...prev, { key: "", label: "", chest: "", waist: "", length: "" }]);
  }

  function removeSizeRow(index: number) {
    setSizes((prev) => prev.filter((_, i) => i !== index));
  }

  function updateTier(index: number, patch: Partial<TierRow>) {
    setTiers((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  function addTierRow() {
    setTiers((prev) => [...prev, { minQty: "", maxQty: "", price: "" }]);
  }

  function removeTierRow(index: number) {
    setTiers((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!template) return;
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const usedKeys = new Set<string>();
      const styleList = styles
        .filter((s) => s.label.trim())
        .map((s) => {
          let key = slugify(s.label);
          while (usedKeys.has(key)) key = `${key}-2`;
          usedKeys.add(key);
          return { key, label: s.label.trim(), price: s.price.trim() ? Number(s.price) : null };
        });

      const usedSizeKeys = new Set<string>();
      const sizeList = sizes
        .filter((s) => s.label.trim())
        .map((s) => {
          let key = slugify(s.label);
          while (usedSizeKeys.has(key)) key = `${key}-2`;
          usedSizeKeys.add(key);
          return {
            key,
            label: s.label.trim(),
            chest: s.chest.trim(),
            waist: s.waist.trim(),
            length: s.length.trim(),
          };
        });

      const tierList = tiers
        .filter((t) => t.minQty.trim() && t.price.trim())
        .map((t) => ({
          minQty: Number(t.minQty),
          maxQty: t.maxQty.trim() ? Number(t.maxQty) : null,
          price: Number(t.price),
        }));

      const { data: created, error } = await supabase
        .from("events")
        .insert({
          store_id: storeId,
          name: name.trim(),
          job_type: template.jobType,
          payer_mode: template.payerMode,
          collection_mode: template.collectionMode,
          pricing_mode: template.pricingMode,
          turnaround_mode: template.turnaroundMode,
          event_date: eventDate || null,
          organiser_name: organiserName.trim() || null,
          organiser_phone: organiserPhone.trim() || null,
          fabric_description: fabricDescription.trim() || null,
          styles: styleList,
          size_chart: sizeList,
          price_tiers: tierList,
          price_per_person: pricePerPerson.trim() ? Number(pricePerPerson) : null,
          deposit_amount: depositAmount.trim() ? Number(depositAmount) : null,
          measurement_deadline: measurementDeadline || null,
          delivery_date: deliveryDate || null,
          created_by: userData.user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      toast.success("Group order created");
      onSaved(created);
      onOpenChange(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not create this group order"));
    } finally {
      setBusy(false);
    }
  }

  const picker = (
    <div className="grid grid-cols-2 gap-2">
      {JOB_TEMPLATES.map((t) => (
        <button
          key={t.jobType}
          type="button"
          onClick={() => setTemplate(t)}
          className="rounded-xl border border-border p-3 text-left transition-colors hover:border-gold hover:bg-accent/40"
        >
          <p className="text-sm font-medium">{t.label}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
        </button>
      ))}
    </div>
  );

  const body = (
    <form onSubmit={handleSubmit} className="space-y-4">
      <button
        type="button"
        onClick={() => setTemplate(null)}
        className="text-xs text-muted-foreground underline-offset-2 hover:underline"
      >
        &larr; {template?.label}, change
      </button>
      <div className="space-y-2">
        <Label htmlFor="event-name">Name</Label>
        <Input
          id="event-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={template?.namePlaceholder}
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="event-date">Event date</Label>
          <Input
            id="event-date"
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="event-delivery">Delivery date</Label>
          <Input
            id="event-delivery"
            type="date"
            value={deliveryDate}
            onChange={(e) => setDeliveryDate(e.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="organiser-name">Organiser name</Label>
          <Input
            id="organiser-name"
            value={organiserName}
            onChange={(e) => setOrganiserName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="organiser-phone">Organiser phone</Label>
          <Input
            id="organiser-phone"
            value={organiserPhone}
            onChange={(e) => setOrganiserPhone(e.target.value)}
            placeholder="0803 123 4567"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="event-fabric">Fabric</Label>
        <Textarea
          id="event-fabric"
          rows={2}
          value={fabricDescription}
          onChange={(e) => setFabricDescription(e.target.value)}
          placeholder="Blue and gold aso-oke, guests to buy from the family"
        />
      </div>

      {template?.collectionMode === "sizes" && (
        <div className="space-y-2">
          <Label>Size chart</Label>
          <div className="space-y-2">
            {sizes.map((size, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  value={size.label}
                  onChange={(e) => updateSize(index, { label: e.target.value })}
                  placeholder="Size (e.g. Small)"
                  className="w-28"
                />
                <Input
                  value={size.chest}
                  onChange={(e) => updateSize(index, { chest: e.target.value })}
                  placeholder="Chest"
                  className="flex-1"
                />
                <Input
                  value={size.waist}
                  onChange={(e) => updateSize(index, { waist: e.target.value })}
                  placeholder="Waist"
                  className="flex-1"
                />
                <Input
                  value={size.length}
                  onChange={(e) => updateSize(index, { length: e.target.value })}
                  placeholder="Length"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeSizeRow(index)}
                  aria-label="Remove size"
                >
                  <Trash2 className="size-4 text-owed" />
                </Button>
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addSizeRow}>
            <Plus className="size-4" />
            Add a size
          </Button>
        </div>
      )}

      {template?.pricingMode === "quantity_tiers" ? (
        <div className="space-y-2">
          <Label>Price bands (by number of people)</Label>
          <div className="space-y-2">
            {tiers.map((tier, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  value={tier.minQty}
                  onChange={(e) => updateTier(index, { minQty: e.target.value })}
                  placeholder="From"
                  inputMode="numeric"
                  className="w-20"
                />
                <Input
                  value={tier.maxQty}
                  onChange={(e) => updateTier(index, { maxQty: e.target.value })}
                  placeholder="To (blank = +)"
                  inputMode="numeric"
                  className="w-28"
                />
                <MoneyInput
                  value={tier.price}
                  onChange={(v) => updateTier(index, { price: v })}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeTierRow(index)}
                  aria-label="Remove band"
                >
                  <Trash2 className="size-4 text-owed" />
                </Button>
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addTierRow}>
            <Plus className="size-4" />
            Add a band
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Label>Styles on offer</Label>
          <div className="space-y-2">
            {styles.map((style, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  value={style.label}
                  onChange={(e) => updateStyle(index, { label: e.target.value })}
                  placeholder="Style name"
                  className="flex-1"
                />
                <MoneyInput
                  value={style.price}
                  onChange={(v) => updateStyle(index, { price: v })}
                  className="w-32"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeStyleRow(index)}
                  aria-label="Remove style"
                >
                  <Trash2 className="size-4 text-owed" />
                </Button>
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addStyleRow}>
            <Plus className="size-4" />
            Add a style
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="price-per-person">Price per person</Label>
          <MoneyInput id="price-per-person" value={pricePerPerson} onChange={setPricePerPerson} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="deposit-amount">Deposit</Label>
          <MoneyInput id="deposit-amount" value={depositAmount} onChange={setDepositAmount} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="measurement-deadline">Measurement deadline</Label>
        <Input
          id="measurement-deadline"
          type="date"
          value={measurementDeadline}
          onChange={(e) => setMeasurementDeadline(e.target.value)}
        />
      </div>

      {!online && <OfflineNotice />}
      <Button type="submit" className="w-full" disabled={busy || !name.trim() || !online}>
        {busy ? "Creating..." : "Create group order"}
      </Button>
    </form>
  );

  const content = template ? body : picker;
  const title = template ? `New ${template.label.toLowerCase()} order` : "What kind of job?";

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="text-left">
            <SheetTitle className="text-2xl">{title}</SheetTitle>
          </SheetHeader>
          <div className="mt-2 pb-4">{content}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
