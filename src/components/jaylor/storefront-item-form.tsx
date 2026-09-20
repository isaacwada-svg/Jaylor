import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useIsMobile } from "@/hooks/use-mobile";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type ItemRow = Tables<"storefront_items">;

export function StorefrontItemForm({
  open,
  onOpenChange,
  storeId,
  item,
  nextSortOrder,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  item?: ItemRow | null;
  nextSortOrder: number;
  onSaved: () => void;
}) {
  const isMobile = useIsMobile();
  const isEdit = !!item;

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [photosRaw, setPhotosRaw] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [turnaroundDays, setTurnaroundDays] = useState("");
  const [isReadyMade, setIsReadyMade] = useState(false);
  const [published, setPublished] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(item?.title ?? "");
    setCategory(item?.category ?? "");
    setDescription(item?.description ?? "");
    setPhotosRaw((item?.photos ?? []).join("\n"));
    setPriceMin(item?.price_min != null ? String(item.price_min) : "");
    setPriceMax(item?.price_max != null ? String(item.price_max) : "");
    setTurnaroundDays(item?.turnaround_days != null ? String(item.turnaround_days) : "");
    setIsReadyMade(item?.is_ready_made ?? false);
    setPublished(item?.published ?? false);
  }, [open, item]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const photos = photosRaw
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 6);

      const payload = {
        title: title.trim(),
        category: category.trim() || null,
        description: description.trim() || null,
        photos,
        price_min: priceMin.trim() ? Number(priceMin) : null,
        price_max: priceMax.trim() ? Number(priceMax) : null,
        turnaround_days: turnaroundDays.trim() ? Number(turnaroundDays) : null,
        is_ready_made: isReadyMade,
        published,
      };

      if (isEdit && item) {
        const { error } = await supabase.from("storefront_items").update(payload).eq("id", item.id);
        if (error) throw error;
        toast.success("Item updated");
      } else {
        const { error } = await supabase.from("storefront_items").insert({
          ...payload,
          store_id: storeId,
          sort_order: nextSortOrder,
        });
        if (error) throw error;
        toast.success("Item added");
      }
      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not save this item"));
    } finally {
      setBusy(false);
    }
  }

  const body = (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="item-title">Title</Label>
        <Input
          id="item-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ankara wrap gown"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="item-category">Category</Label>
        <Input
          id="item-category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Gowns, Agbada, Bridal..."
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="item-description">Description</Label>
        <Textarea
          id="item-description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="item-photos">Photo links (one per line, up to 6)</Label>
        <Textarea
          id="item-photos"
          rows={3}
          value={photosRaw}
          onChange={(e) => setPhotosRaw(e.target.value)}
          placeholder="https://..."
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="item-price-min">From (₦)</Label>
          <MoneyInput id="item-price-min" value={priceMin} onChange={setPriceMin} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="item-price-max">Up to (₦)</Label>
          <MoneyInput id="item-price-max" value={priceMax} onChange={setPriceMax} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="item-turnaround">Turnaround (days)</Label>
        <Input
          id="item-turnaround"
          type="number"
          min={0}
          value={turnaroundDays}
          onChange={(e) => setTurnaroundDays(e.target.value)}
        />
      </div>
      <label className="flex items-center justify-between rounded-xl border border-border p-3">
        <span className="text-sm">Ready-made (in stock)</span>
        <Switch checked={isReadyMade} onCheckedChange={setIsReadyMade} />
      </label>
      <label className="flex items-center justify-between rounded-xl border border-border p-3">
        <span className="text-sm">Published on your shop page</span>
        <Switch checked={published} onCheckedChange={setPublished} />
      </label>
      <Button type="submit" className="w-full" disabled={busy || !title.trim()}>
        {busy ? "Saving..." : isEdit ? "Save changes" : "Add item"}
      </Button>
    </form>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="text-left">
            <SheetTitle className="text-2xl">{isEdit ? "Edit item" : "New item"}</SheetTitle>
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
          <DialogTitle>{isEdit ? "Edit item" : "New item"}</DialogTitle>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
