import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Plus, Settings2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useJobTemplates, type JobTemplateWithMeta } from "@/lib/use-job-templates";
import { getErrorMessage } from "@/lib/utils";
import {
  type CollectionMode,
  type JobType,
  type PayerMode,
  type PricingMode,
  type TurnaroundMode,
} from "@/lib/job-templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useQueryClient } from "@tanstack/react-query";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const PAYER_MODES: { value: PayerMode; label: string }[] = [
  { value: "each_pays", label: "Each person pays their own share" },
  { value: "single_payer", label: "One person pays for everyone" },
];
const COLLECTION_MODES: { value: CollectionMode; label: string }[] = [
  { value: "measurements", label: "Each person's own measurements" },
  { value: "sizes", label: "Pick from a size chart (S/M/L, etc.)" },
  { value: "none", label: "No sizing needed" },
];
const PRICING_MODES: { value: PricingMode; label: string }[] = [
  { value: "flat", label: "One flat price" },
  { value: "by_garment", label: "Priced per style/garment" },
  { value: "quantity_tiers", label: "Price bands by quantity" },
];
const TURNAROUND_MODES: { value: TurnaroundMode; label: string }[] = [
  { value: "standard", label: "Standard" },
  { value: "rush", label: "Rush by default" },
];

export function JobTemplateManagerButton({ storeId }: { storeId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Settings2 className="size-4" />
        Manage job types
      </Button>
      <JobTemplateManager open={open} onOpenChange={setOpen} storeId={storeId} />
    </>
  );
}

function JobTemplateManager({
  open,
  onOpenChange,
  storeId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
}) {
  const queryClient = useQueryClient();
  const { data: templates } = useJobTemplates(open ? storeId : undefined);
  const [editing, setEditing] = useState<JobTemplateWithMeta | "new" | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["job-templates", storeId] });
  }

  async function toggleHidden(template: JobTemplateWithMeta) {
    setBusyId(template.id);
    try {
      const { error } = await supabase
        .from("job_templates")
        .update({ hidden: !template.hidden })
        .eq("id", template.id);
      if (error) throw error;
      invalidate();
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not update this job type"));
    } finally {
      setBusyId(null);
    }
  }

  async function deleteTemplate(template: JobTemplateWithMeta) {
    setBusyId(template.id);
    try {
      const { error } = await supabase.from("job_templates").delete().eq("id", template.id);
      if (error) throw error;
      toast.success("Job type deleted");
      invalidate();
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not delete this job type"));
    } finally {
      setBusyId(null);
    }
  }

  if (editing) {
    return (
      <JobTemplateForm
        open={open}
        onOpenChange={onOpenChange}
        storeId={storeId}
        template={editing === "new" ? null : editing}
        onBack={() => setEditing(null)}
        onSaved={() => {
          invalidate();
          setEditing(null);
        }}
      />
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="text-left">
          <SheetTitle className="text-2xl">Manage job types</SheetTitle>
        </SheetHeader>
        <div className="mt-2 space-y-2 pb-4">
          <p className="text-sm text-muted-foreground">
            Hide the built-in kinds you don&apos;t use, or add your own. Built-ins can&apos;t be
            deleted since past jobs rely on them, but you can hide them from the picker.
          </p>
          {(templates ?? []).map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{t.label}</p>
                <p className="truncate text-xs text-muted-foreground">{t.description}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {!isBuiltIn(t) ? (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditing(t)}
                      disabled={busyId === t.id}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteTemplate(t)}
                      disabled={busyId === t.id}
                      aria-label="Delete"
                    >
                      <Trash2 className="size-4 text-owed" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="text-xs text-muted-foreground">
                      {t.hidden ? "Hidden" : "Shown"}
                    </span>
                    <Switch
                      checked={!t.hidden}
                      onCheckedChange={() => toggleHidden(t)}
                      disabled={busyId === t.id}
                    />
                  </>
                )}
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => setEditing("new")}
          >
            <Plus className="size-4" />
            Add a custom job type
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

const BUILT_IN_JOB_TYPES = new Set([
  "aso_ebi",
  "burial",
  "family_occasion",
  "association",
  "school_uniform",
  "corporate_uniform",
  "sports_team",
  "diaspora",
  "remote_individual",
  "ready_to_wear",
]);

function isBuiltIn(t: JobTemplateWithMeta) {
  return BUILT_IN_JOB_TYPES.has(t.jobType);
}

function JobTemplateForm({
  open,
  onOpenChange,
  storeId,
  template,
  onBack,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  template: JobTemplateWithMeta | null;
  onBack: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!template;
  const [label, setLabel] = useState(template?.label ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [namePlaceholder, setNamePlaceholder] = useState(template?.namePlaceholder ?? "");
  const [payerMode, setPayerMode] = useState<PayerMode>(template?.payerMode ?? "each_pays");
  const [collectionMode, setCollectionMode] = useState<CollectionMode>(
    template?.collectionMode ?? "measurements",
  );
  const [pricingMode, setPricingMode] = useState<PricingMode>(template?.pricingMode ?? "flat");
  const [turnaroundMode, setTurnaroundMode] = useState<TurnaroundMode>(
    template?.turnaroundMode ?? "standard",
  );
  const [isContract, setIsContract] = useState(template?.isContract ?? false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLabel(template?.label ?? "");
    setDescription(template?.description ?? "");
    setNamePlaceholder(template?.namePlaceholder ?? "");
    setPayerMode(template?.payerMode ?? "each_pays");
    setCollectionMode(template?.collectionMode ?? "measurements");
    setPricingMode(template?.pricingMode ?? "flat");
    setTurnaroundMode(template?.turnaroundMode ?? "standard");
    setIsContract(template?.isContract ?? false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, template?.id]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!label.trim()) {
      toast.error("Give this job type a name");
      return;
    }
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (isEdit && template) {
        const { error } = await supabase
          .from("job_templates")
          .update({
            label: label.trim(),
            description: description.trim(),
            name_placeholder: namePlaceholder.trim(),
            payer_mode: payerMode,
            collection_mode: collectionMode,
            pricing_mode: pricingMode,
            turnaround_mode: turnaroundMode,
            is_contract: isContract,
          })
          .eq("id", template.id);
        if (error) throw error;
        toast.success("Job type updated");
      } else {
        const jobType =
          `custom_${slugify(label)}_${Math.random().toString(36).slice(2, 7)}` as JobType;
        const { error } = await supabase.from("job_templates").insert({
          store_id: storeId,
          job_type: jobType,
          label: label.trim(),
          description: description.trim(),
          name_placeholder: namePlaceholder.trim(),
          payer_mode: payerMode,
          collection_mode: collectionMode,
          pricing_mode: pricingMode,
          turnaround_mode: turnaroundMode,
          is_contract: isContract,
          created_by: userData.user?.id ?? null,
        });
        if (error) throw error;
        toast.success("Job type added");
      }
      onSaved();
    } catch (error) {
      toast.error(getErrorMessage(error, `Could not ${isEdit ? "save" : "add"} this job type`));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="text-left">
          <SheetTitle className="text-2xl">
            {isEdit ? `Edit ${template.label}` : "Add a custom job type"}
          </SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="mt-2 space-y-4 pb-4">
          <button
            type="button"
            onClick={onBack}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            &larr; Back
          </button>
          <div className="space-y-2">
            <Label htmlFor="jt-label">Name</Label>
            <Input
              id="jt-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Traditional wedding attire"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="jt-description">Description</Label>
            <Textarea
              id="jt-description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Shown under the name in the picker"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="jt-placeholder">Example order name</Label>
            <Input
              id="jt-placeholder"
              value={namePlaceholder}
              onChange={(e) => setNamePlaceholder(e.target.value)}
              placeholder="Shown as a placeholder when naming a new order"
            />
          </div>
          <div className="space-y-2">
            <Label>Who pays?</Label>
            <Select value={payerMode} onValueChange={(v) => setPayerMode(v as PayerMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYER_MODES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>What do you collect from each person?</Label>
            <Select
              value={collectionMode}
              onValueChange={(v) => setCollectionMode(v as CollectionMode)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COLLECTION_MODES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>How is it priced?</Label>
            <Select value={pricingMode} onValueChange={(v) => setPricingMode(v as PricingMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRICING_MODES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Turnaround</Label>
            <Select
              value={turnaroundMode}
              onValueChange={(v) => setTurnaroundMode(v as TurnaroundMode)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TURNAROUND_MODES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border p-3">
            <div>
              <p className="text-sm font-medium">Starts as a quote</p>
              <p className="text-xs text-muted-foreground">
                For school/company-style jobs needing a formal quote and invoice before it's live.
              </p>
            </div>
            <Switch checked={isContract} onCheckedChange={setIsContract} />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Saving..." : isEdit ? "Save changes" : "Add job type"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
