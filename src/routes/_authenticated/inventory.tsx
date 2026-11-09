import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { History, Pencil, Plus } from "lucide-react";
import { AppShell } from "@/components/jaylor/app-shell";
import { EmptyState } from "@/components/jaylor/empty-state";
import { OfflineNotice } from "@/components/jaylor/offline-notice";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { TierBadge } from "@/components/jaylor/tier-badge";
import { MoneyText } from "@/components/jaylor/money-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
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
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store-context";
import { useFeature } from "@/lib/use-feature";
import { useOnlineStatus } from "@/lib/use-online-status";
import { planCodeToTier } from "@/lib/jaylor";
import {
  CATEGORY_LABELS,
  INVENTORY_CATEGORIES,
  INVENTORY_UNITS,
  UNIT_LABELS,
  formatQuantity,
  isLowStock,
  parseQuantity,
  type InventoryCategory,
  type InventoryUnit,
} from "@/lib/inventory";
import { getErrorMessage } from "@/lib/utils";
import { useAppT } from "@/lib/i18n/i18n-context";

export const Route = createFileRoute("/_authenticated/inventory")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Inventory — Jaylor" },
      { name: "description", content: "Track stock of linings, zips, thread and other materials." },
    ],
  }),
  component: InventoryPage,
});

type InventoryItem = {
  id: string;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  reorder_level: number;
  cost_per_unit?: number | null;
  is_active: boolean;
};

type InventoryT = ReturnType<typeof useAppT>;

function categoryLabel(t: InventoryT, category: string): string {
  return t(`category_${category}`) || CATEGORY_LABELS[category as InventoryCategory] || category;
}

function unitLabel(t: InventoryT, unit: string): string {
  return t(`unit_${unit}`) || UNIT_LABELS[unit as InventoryUnit] || unit;
}

function InventoryPage() {
  const t = useAppT("app_inventory");
  const { currentStore, currentRole } = useStore();
  const storeId = currentStore?.id;
  const canManage = currentRole === "owner" || currentRole === "manager";
  const online = useOnlineStatus();
  const queryClient = useQueryClient();

  const { data: feature, isLoading: featureLoading } = useFeature(storeId, "inventory");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [newItemOpen, setNewItemOpen] = useState(false);
  const [stockInItem, setStockInItem] = useState<InventoryItem | null>(null);
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);

  const { data: items, isLoading } = useQuery({
    queryKey: ["inventory-items", storeId, canManage],
    enabled: !!storeId && !!feature?.allowed,
    queryFn: async () => {
      if (canManage) {
        const { data, error } = await supabase
          .from("inventory_items")
          .select("*")
          .eq("store_id", storeId as string)
          .order("name");
        if (error) throw error;
        return data as InventoryItem[];
      }
      const { data, error } = await supabase
        .from("inventory_items_for_tailor")
        .select("*")
        .eq("store_id", storeId as string)
        .order("name");
      if (error) throw error;
      return (data ?? []) as InventoryItem[];
    },
  });

  function invalidateItems() {
    queryClient.invalidateQueries({ queryKey: ["inventory-items", storeId] });
    queryClient.invalidateQueries({ queryKey: ["inventory-movements"] });
  }

  const filtered = useMemo(() => {
    return (items ?? []).filter((item) => {
      if (category !== "all" && item.category !== category) return false;
      if (search.trim() && !item.name.toLowerCase().includes(search.trim().toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [items, category, search]);

  if (featureLoading) {
    return (
      <AppShell>
        <div className="mx-auto w-full max-w-3xl px-4 py-6 lg:px-8 lg:py-10">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="mt-4 h-64 rounded-2xl" />
        </div>
      </AppShell>
    );
  }

  if (!feature?.allowed) {
    return (
      <AppShell>
        <div className="mx-auto w-full max-w-3xl px-4 py-6 lg:px-8 lg:py-10">
          <EmptyState
            title={t("upgrade_title") || "Upgrade to track inventory"}
            description={
              t("upgrade_description") ||
              "Track stock of linings, zips, thread and other materials, and get warned before you run out. Available on the Business plan and above."
            }
            action={
              <div className="flex flex-col items-center gap-2">
                <TierBadge tier={planCodeToTier(feature?.required_plan ?? "business")} />
                <Button
                  onClick={() =>
                    toast(t("billing_coming_soon") || "Billing isn't set up yet — coming soon")
                  }
                >
                  {t("upgrade_to_business") || "Upgrade to Business"}
                </Button>
              </div>
            }
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-6 lg:px-8 lg:py-10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl">{t("page_title") || "Inventory"}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("subtitle") || "Track stock of linings, zips, thread and other materials."}
            </p>
          </div>
          {canManage && (
            <Button className="shrink-0" onClick={() => setNewItemOpen(true)} disabled={!online}>
              <Plus className="size-4" />
              {t("new_item") || "New item"}
            </Button>
          )}
        </div>
        <StitchDivider className="my-6" />

        {!online && (
          <OfflineNotice label={t("offline_notice") || "Inventory needs a connection."} />
        )}

        <div className="flex flex-wrap gap-2">
          <Input
            placeholder={t("search_items_placeholder") || "Search items"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("all_categories") || "All categories"}</SelectItem>
              {INVENTORY_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {categoryLabel(t, c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="mt-4">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-20 rounded-2xl" />
              <Skeleton className="h-20 rounded-2xl" />
            </div>
          ) : filtered.length === 0 && (items?.length ?? 0) > 0 ? (
            <EmptyState
              title={t("no_matches_title") || "No matching items"}
              description={t("no_matches_description") || "Try a different search or category."}
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              title={t("empty_items_title") || "No items yet"}
              description={
                t("empty_items_description") ||
                "Add your linings, zips and other stock to track what you have."
              }
            />
          ) : (
            <div className="space-y-2">
              {filtered.map((item) => (
                <div key={item.id} className="rounded-xl border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{item.name}</p>
                        {!item.is_active && (
                          <Badge variant="secondary">{t("inactive_badge") || "Inactive"}</Badge>
                        )}
                        {isLowStock(item) && (
                          <Badge className="bg-owed/15 text-owed">
                            {t("low_stock_badge") || "Low stock"}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {categoryLabel(t, item.category)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="figures font-medium">
                        {formatQuantity(item.quantity, item.unit)}
                      </p>
                      {canManage && item.cost_per_unit != null && (
                        <p className="text-xs text-muted-foreground">
                          <MoneyText amount={item.cost_per_unit} /> / {unitLabel(t, item.unit)}
                        </p>
                      )}
                    </div>
                  </div>
                  {canManage && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!online}
                        onClick={() => setStockInItem(item)}
                      >
                        {t("stock_in_button") || "Stock in"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!online}
                        onClick={() => setAdjustItem(item)}
                      >
                        {t("adjust_button") || "Adjust"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!online}
                        onClick={() => setHistoryItem(item)}
                      >
                        <History className="size-4" />
                        {t("history_button") || "History"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!online}
                        onClick={() => setEditItem(item)}
                      >
                        <Pencil className="size-4" />
                        {t("edit_button") || "Edit"}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {storeId && (
        <NewItemDialog
          open={newItemOpen}
          onOpenChange={setNewItemOpen}
          storeId={storeId}
          onSaved={invalidateItems}
        />
      )}
      <StockInDialog
        item={stockInItem}
        onOpenChange={() => setStockInItem(null)}
        onSaved={invalidateItems}
      />
      <AdjustDialog
        item={adjustItem}
        onOpenChange={() => setAdjustItem(null)}
        onSaved={invalidateItems}
      />
      <HistoryDialog item={historyItem} onOpenChange={() => setHistoryItem(null)} />
      <EditItemDialog
        item={editItem}
        onOpenChange={() => setEditItem(null)}
        onSaved={invalidateItems}
      />
    </AppShell>
  );
}

function NewItemDialog({
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
  const t = useAppT("app_inventory");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<InventoryCategory>("lining");
  const [unit, setUnit] = useState<InventoryUnit>("yard");
  const [reorderLevel, setReorderLevel] = useState("");
  const [initialQuantity, setInitialQuantity] = useState("");
  const [costPerUnit, setCostPerUnit] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setName("");
    setCategory("lining");
    setUnit("yard");
    setReorderLevel("");
    setInitialQuantity("");
    setCostPerUnit("");
  }

  const parsedInitial = parseQuantity(initialQuantity, 0);
  const parsedReorder = parseQuantity(reorderLevel, 0);
  const invalid = parsedInitial === null || parsedReorder === null;

  async function save() {
    if (!name.trim() || parsedInitial === null || parsedReorder === null) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("create_inventory_item", {
        p_store_id: storeId,
        p_name: name.trim(),
        p_category: category,
        p_unit: unit,
        p_reorder_level: parsedReorder,
        p_initial_quantity: parsedInitial,
        ...(costPerUnit ? { p_cost_per_unit: Number(costPerUnit) } : {}),
      });
      if (error) throw error;
      toast.success(t("toast_item_added") || "Item added");
      onSaved();
      reset();
      onOpenChange(false);
    } catch (error) {
      toast.error(
        getErrorMessage(error, t("toast_could_not_add_item") || "Could not add this item"),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("new_item_title") || "New inventory item"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>{t("name_label") || "Name"}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("name_placeholder") || "e.g. White lining"}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t("category_label") || "Category"}</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as InventoryCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INVENTORY_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {categoryLabel(t, c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("unit_label") || "Unit"}</Label>
              <Select value={unit} onValueChange={(v) => setUnit(v as InventoryUnit)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INVENTORY_UNITS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {unitLabel(t, u)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t("starting_quantity_label") || "Starting quantity"}</Label>
              <Input
                inputMode="decimal"
                value={initialQuantity}
                onChange={(e) => setInitialQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("reorder_level_label") || "Reorder level"}</Label>
              <Input
                inputMode="decimal"
                value={reorderLevel}
                onChange={(e) => setReorderLevel(e.target.value)}
              />
            </div>
          </div>
          {invalid && <InvalidNumberNotice />}
          <div className="space-y-2">
            <Label>{t("cost_per_unit_label") || "Cost per unit (optional)"}</Label>
            <MoneyInput value={costPerUnit} onChange={setCostPerUnit} />
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!name.trim() || invalid || saving} onClick={() => void save()}>
            {saving ? t("adding") || "Adding..." : t("add_item_button") || "Add item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StockInDialog({
  item,
  onOpenChange,
  onSaved,
}: {
  item: InventoryItem | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useAppT("app_inventory");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const parsedQuantity = parseQuantity(quantity);
  const invalid = quantity.trim() !== "" && !parsedQuantity;

  async function save() {
    if (!item || !parsedQuantity) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("record_stock_in", {
        p_item_id: item.id,
        p_quantity: parsedQuantity,
        ...(unitCost ? { p_unit_cost: Number(unitCost) } : {}),
        ...(note.trim() ? { p_note: note.trim() } : {}),
      });
      if (error) throw error;
      toast.success(t("toast_stock_added") || "Stock added");
      onSaved();
      setQuantity("");
      setUnitCost("");
      setNote("");
      onOpenChange(false);
    } catch (error) {
      toast.error(
        getErrorMessage(error, t("toast_could_not_record_stock") || "Could not record stock"),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("stock_in_label") || "Stock in"}
            {item ? `: ${item.name}` : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>{t("quantity_received_label") || "Quantity received"}</Label>
            <Input
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
            {invalid && <InvalidNumberNotice />}
          </div>
          <div className="space-y-2">
            <Label>
              {t("cost_per_unit_received_label", {
                unit: item ? unitLabel(t, item.unit).toLowerCase() : "unit",
              }) || `Cost per ${item?.unit ?? "unit"} (optional)`}
            </Label>
            <MoneyInput value={unitCost} onChange={setUnitCost} />
          </div>
          <div className="space-y-2">
            <Label>{t("note_optional_label") || "Note (optional)"}</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!parsedQuantity || saving} onClick={() => void save()}>
            {saving ? t("saving") || "Saving..." : t("add_stock_button") || "Add stock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdjustDialog({
  item,
  onOpenChange,
  onSaved,
}: {
  item: InventoryItem | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useAppT("app_inventory");
  const [newQuantity, setNewQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const parsedQuantity = parseQuantity(newQuantity);
  const invalid = newQuantity.trim() !== "" && parsedQuantity === null;

  async function save() {
    if (!item || parsedQuantity === null || !reason.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("adjust_stock", {
        p_item_id: item.id,
        p_new_quantity: parsedQuantity,
        p_reason: reason.trim(),
      });
      if (error) throw error;
      toast.success(t("toast_stock_adjusted") || "Stock adjusted");
      onSaved();
      setNewQuantity("");
      setReason("");
      onOpenChange(false);
    } catch (error) {
      toast.error(
        getErrorMessage(error, t("toast_could_not_adjust_stock") || "Could not adjust stock"),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("adjust_stock_label") || "Adjust stock"}
            {item ? `: ${item.name}` : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t("current_prefix") || "Current:"}{" "}
            {item ? formatQuantity(item.quantity, item.unit) : ""}
          </p>
          <div className="space-y-2">
            <Label>{t("correct_quantity_label") || "Correct quantity to"}</Label>
            <Input
              inputMode="decimal"
              value={newQuantity}
              onChange={(e) => setNewQuantity(e.target.value)}
            />
            {invalid && <InvalidNumberNotice />}
          </div>
          <div className="space-y-2">
            <Label>{t("reason_label") || "Reason"}</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={parsedQuantity === null || !reason.trim() || saving}
            onClick={() => void save()}
          >
            {saving ? t("saving") || "Saving..." : t("save_correction_button") || "Save correction"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({
  item,
  onOpenChange,
}: {
  item: InventoryItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useAppT("app_inventory");
  const { data: movements } = useQuery({
    queryKey: ["inventory-movements", item?.id],
    enabled: !!item,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("*")
        .eq("item_id", item?.id as string)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("history_button") || "History"}
            {item ? `: ${item.name}` : ""}
          </DialogTitle>
        </DialogHeader>
        {!movements || movements.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("no_movements") || "No movements yet."}
          </p>
        ) : (
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {movements.map((m) => (
              <div key={m.id} className="flex items-center justify-between text-sm">
                <div>
                  <p>
                    {m.type === "in" && (t("movement_stock_in") || "Stock in")}
                    {m.type === "used" && (t("movement_used") || "Used")}
                    {m.type === "adjust" && (t("movement_adjusted") || "Adjusted")}
                    {m.type === "return" && (t("movement_returned") || "Returned")}
                    {m.note ? ` — ${m.note}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(m.created_at).toLocaleDateString()}
                  </p>
                </div>
                <p className="figures">
                  {m.type === "adjust" && m.quantity > 0 ? "+" : ""}
                  {m.quantity} {item ? unitLabel(t, item.unit).toLowerCase() : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InvalidNumberNotice() {
  const t = useAppT("app_inventory");
  return (
    <p className="text-xs text-destructive">{t("invalid_number") || "Enter a valid number"}</p>
  );
}

function EditItemDialog({
  item,
  onOpenChange,
  onSaved,
}: {
  item: InventoryItem | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useAppT("app_inventory");
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("lining");
  const [unit, setUnit] = useState<string>("yard");
  const [reorderLevel, setReorderLevel] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load the item's current values each time a different item is opened.
  if (item && item.id !== loadedId) {
    setLoadedId(item.id);
    setName(item.name);
    setCategory(item.category);
    setUnit(item.unit);
    setReorderLevel(String(item.reorder_level));
    setIsActive(item.is_active);
  }

  const parsedReorder = parseQuantity(reorderLevel, 0);
  const invalid = parsedReorder === null;

  async function save() {
    if (!item || !name.trim() || parsedReorder === null) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("update_inventory_item", {
        p_item_id: item.id,
        p_name: name.trim(),
        p_category: category,
        p_unit: unit,
        p_reorder_level: parsedReorder,
        p_is_active: isActive,
      });
      if (error) throw error;
      toast.success(t("toast_item_updated") || "Item updated");
      onSaved();
      setLoadedId(null);
      onOpenChange(false);
    } catch (error) {
      toast.error(
        getErrorMessage(error, t("toast_could_not_update_item") || "Could not update this item"),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={!!item}
      onOpenChange={(open) => {
        if (!open) setLoadedId(null);
        onOpenChange(open);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("edit_item_title") || "Edit item"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>{t("name_label") || "Name"}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t("category_label") || "Category"}</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INVENTORY_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {categoryLabel(t, c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("unit_label") || "Unit"}</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INVENTORY_UNITS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {unitLabel(t, u)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("reorder_level_label") || "Reorder level"}</Label>
            <Input
              inputMode="decimal"
              value={reorderLevel}
              onChange={(e) => setReorderLevel(e.target.value)}
            />
            {invalid && <InvalidNumberNotice />}
          </div>
          <div className="flex items-start justify-between gap-3 rounded-xl border border-border p-3">
            <div>
              <Label htmlFor="inventory-item-active">{t("active_label") || "Active"}</Label>
              <p className="text-xs text-muted-foreground">
                {t("active_hint") || "Inactive items can't be used on orders."}
              </p>
            </div>
            <Switch id="inventory-item-active" checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!name.trim() || invalid || saving} onClick={() => void save()}>
            {saving ? t("saving") || "Saving..." : t("save_changes_button") || "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
