import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Info, Share2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { computeAgeGroup, computeTemplateSex, isMinor, type AgeGroup } from "@/lib/jaylor";
import {
  changeThreshold,
  measurementRatioWarnings,
  pickDefaultTemplate,
  templateFields,
  type TemplateField,
} from "@/lib/measurements";
import { getErrorMessage, cn } from "@/lib/utils";
import { enqueue, isNetworkFailure } from "@/lib/offline/outbox";
import { useOnlineStatus } from "@/lib/use-online-status";
import { EmptyState } from "@/components/jaylor/empty-state";
import { MeasurementDiagram, measurementGuideText } from "@/components/jaylor/measurement-diagram";
import { SendPassportButton } from "@/components/jaylor/passport-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ClientRow = Tables<"clients">;
type TemplateRow = Tables<"measurement_templates">;
type MeasurementSetRow = Tables<"measurement_sets">;

const RE_MEASURE_MS = 1000 * 60 * 60 * 24 * 90; // 3 months

function isReMeasureDue(set: MeasurementSetRow, ageGroup: AgeGroup) {
  if (ageGroup === "adult") return false;
  return Date.now() - new Date(set.taken_at).getTime() > RE_MEASURE_MS;
}

export function MeasurementsTab({ client }: { client: ClientRow }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const { data: templates, isLoading: templatesLoading } = useQuery({
    queryKey: ["measurement-templates", client.store_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("measurement_templates")
        .select("*")
        .eq("store_id", client.store_id)
        .eq("hidden", false);
      if (error) throw error;
      return data;
    },
  });

  const { data: sets, isLoading: setsLoading } = useQuery({
    queryKey: ["measurement-sets", client.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("measurement_sets")
        .select("*")
        .eq("client_id", client.id)
        .order("version", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  if (templatesLoading || setsLoading) {
    return <Skeleton className="h-40 rounded-2xl" />;
  }

  const ageGroup = computeAgeGroup(client.birthday);
  const sex = computeTemplateSex(client.gender);
  const defaultTemplate = pickDefaultTemplate(templates ?? [], ageGroup, sex);
  const latest = sets?.[0];

  if (editing) {
    return (
      <MeasurementForm
        client={client}
        templates={templates ?? []}
        defaultTemplateId={defaultTemplate?.id}
        previous={latest}
        onCancel={() => setEditing(false)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["measurement-sets", client.id] });
          setEditing(false);
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {latest && isReMeasureDue(latest, ageGroup) && (
        <div className="rounded-xl border border-owed/40 bg-owed/10 p-3 text-sm">
          Children grow fast, re-measure?
        </div>
      )}

      {latest ? (
        <LatestSummary set={latest} templates={templates ?? []} />
      ) : (
        <EmptyState
          title="No measurements yet"
          description="Take this client's first set of measurements when you create their next order."
        />
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setEditing(true)}>
          {latest ? "New measurement" : "Take measurements"}
        </Button>
        <ShareGuideButton clientName={client.full_name} />
        {latest && (
          <SendPassportButton
            clientId={client.id}
            clientName={client.full_name}
            phone={client.whatsapp_phone ?? client.phone}
          />
        )}
      </div>

      {sets && sets.length > 1 && <HistoryList sets={sets.slice(1)} templates={templates ?? []} />}
    </div>
  );
}

/** Shares the public self-measuring guide, for clients who aren't physically around. */
function ShareGuideButton({ clientName }: { clientName: string }) {
  async function share() {
    const url = `${window.location.origin}/measure-guide`;
    const text = `Hi ${clientName}, please follow this guide to take your own measurements and send them back to me: ${url}`;
    if (navigator.share) {
      try {
        await navigator.share({ text, url });
        return;
      } catch {
        // user cancelled or share failed — fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Guide link copied — paste it in a message to your client");
    } catch {
      toast.error("Could not copy the link");
    }
  }

  return (
    <Button type="button" variant="outline" onClick={share}>
      <Share2 className="size-4" />
      Send measuring guide
    </Button>
  );
}

function MeasurementHelpButton({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`How to measure ${label}`}
        className="text-muted-foreground hover:text-gold"
      >
        <Info className="size-3.5" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
          </DialogHeader>
          <MeasurementDiagram label={label} className="mx-auto h-56 w-auto" />
          <p className="text-sm text-muted-foreground">{measurementGuideText(label)}</p>
        </DialogContent>
      </Dialog>
    </>
  );
}

function LatestSummary({ set, templates }: { set: MeasurementSetRow; templates: TemplateRow[] }) {
  const template = templates.find((t) => t.id === set.template_id);
  const fields = template ? templateFields(template) : [];
  const values = (set.values ?? {}) as Record<string, number>;

  return (
    <div className="rounded-2xl border border-border p-4">
      <div className="flex items-center justify-between">
        <p className="font-medium">
          {template?.name ?? "Measurements"} · v{set.version}
        </p>
        <p className="text-xs text-muted-foreground">
          {new Date(set.taken_at).toLocaleDateString()}
        </p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
        {fields.map(
          (f) =>
            values[f.key] !== undefined && (
              <div key={f.key} className="flex justify-between gap-2">
                <span className="text-muted-foreground">{f.label}</span>
                <span className="figures">
                  {values[f.key]}
                  {set.unit}
                </span>
              </div>
            ),
        )}
      </div>
      {set.notes && <p className="mt-3 text-sm text-muted-foreground">{set.notes}</p>}
    </div>
  );
}

function HistoryList({ sets, templates }: { sets: MeasurementSetRow[]; templates: TemplateRow[] }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-muted-foreground">History</p>
      <div className="space-y-2">
        {sets.map((s) => {
          const template = templates.find((t) => t.id === s.template_id);
          return (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-xl border border-border p-3 text-sm"
            >
              <span>
                {template?.name ?? "Measurements"} · v{s.version}
              </span>
              <span className="text-muted-foreground">
                {new Date(s.taken_at).toLocaleDateString()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MeasurementForm({
  client,
  templates,
  defaultTemplateId,
  previous,
  onCancel,
  onSaved,
}: {
  client: ClientRow;
  templates: TemplateRow[];
  defaultTemplateId: string | undefined;
  previous: MeasurementSetRow | undefined;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const online = useOnlineStatus();
  const [templateId, setTemplateId] = useState(defaultTemplateId ?? templates[0]?.id ?? "");
  const [unit, setUnit] = useState<"in" | "cm">((previous?.unit as "in" | "cm") ?? "in");
  const [values, setValues] = useState<Record<string, string>>({});
  const [growth, setGrowth] = useState<Record<string, string>>({});
  const [extraFields, setExtraFields] = useState<{ label: string; value: string }[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const template = templates.find((t) => t.id === templateId);
  const fields = template ? templateFields(template) : [];
  const ageGroup = computeAgeGroup(client.birthday);
  const showGrowth = ageGroup === "child" || ageGroup === "teen";
  const threshold = changeThreshold(ageGroup);
  const previousValues = (previous?.values ?? {}) as Record<string, number>;
  const numericValues: Record<string, number> = {};
  for (const f of fields) {
    const raw = values[f.key];
    if (raw?.trim() && !Number.isNaN(Number(raw))) numericValues[f.key] = Number(raw);
  }
  const ratioWarnings = measurementRatioWarnings(fields, numericValues);

  useEffect(() => {
    setValues({});
    setGrowth({});
  }, [templateId]);

  async function handleSave(event: FormEvent) {
    event.preventDefault();

    const missing = fields.filter((f) => f.required && !values[f.key]?.trim());
    if (missing.length > 0) {
      toast.error(`Fill in: ${missing.map((f) => f.label).join(", ")}`);
      return;
    }
    if (isMinor(client.birthday) && (!client.guardian_name || !client.guardian_phone)) {
      toast.error(
        "Add this client's guardian details first (edit the client) before saving measurements.",
      );
      return;
    }

    setBusy(true);
    try {
      const valuesObj: Record<string, number> = {};
      for (const f of fields) {
        const raw = values[f.key];
        if (raw?.trim()) valuesObj[f.key] = Number(raw);
      }
      const growthObj: Record<string, number> = {};
      if (showGrowth) {
        for (const f of fields) {
          const raw = growth[f.key];
          if (raw?.trim()) growthObj[f.key] = Number(raw);
        }
      }
      const extraObj: Record<string, number | string> = {};
      for (const row of extraFields) {
        if (row.label.trim() && row.value.trim()) {
          const numeric = Number(row.value);
          extraObj[row.label.trim()] = Number.isNaN(numeric) ? row.value.trim() : numeric;
        }
      }

      const { data: userData } = await supabase.auth.getUser();
      const payload = {
        store_id: client.store_id,
        client_id: client.id,
        template_id: templateId || null,
        values: valuesObj,
        extra_fields: extraObj,
        growth_allowance: growthObj,
        unit,
        source: "manual",
        taken_by: userData.user?.id ?? null,
        notes: notes.trim() || null,
      };

      if (!online) {
        await enqueue({
          kind: "measurement.create",
          storeId: client.store_id,
          label: `Measurements for ${client.full_name}`,
          payload,
        });
        toast.success("Saved offline — will sync when you're back online");
        onSaved();
        return;
      }

      try {
        const { error } = await supabase.from("measurement_sets").insert(payload);
        if (error) throw error;
        toast.success("Measurements saved");
      } catch (error) {
        if (!isNetworkFailure(error)) throw error;
        await enqueue({
          kind: "measurement.create",
          storeId: client.store_id,
          label: `Measurements for ${client.full_name}`,
          payload,
        });
        toast.success("Saved offline — will sync when you're back online");
      }
      onSaved();
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not save measurements"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1 space-y-2">
          <Label>Template</Label>
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Unit</Label>
          <div className="flex overflow-hidden rounded-xl border border-input">
            {(["in", "cm"] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnit(u)}
                className={cn(
                  "touch-target px-3 py-2 text-sm font-medium",
                  unit === u ? "bg-accent text-gold" : "text-muted-foreground",
                )}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {fields.map((f: TemplateField) => {
          const prev = previousValues[f.key];
          const current = values[f.key];
          const numeric = current?.trim() ? Number(current) : undefined;
          const delta = prev !== undefined && numeric !== undefined ? Math.abs(numeric - prev) : 0;
          const flaggedChange = prev !== undefined && numeric !== undefined && delta > threshold;
          const outOfRange =
            numeric !== undefined &&
            ((f.min !== undefined && numeric < f.min) || (f.max !== undefined && numeric > f.max));
          return (
            <div key={f.key} className="space-y-1">
              <div className="flex items-center gap-1">
                <Label htmlFor={f.key}>
                  {f.label}
                  {f.required && " *"}
                </Label>
                <MeasurementHelpButton label={f.label} />
              </div>
              <Input
                id={f.key}
                inputMode="decimal"
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              />
              {flaggedChange && (
                <p className="text-xs text-owed">Check this: last time was {prev}</p>
              )}
              {outOfRange && (
                <p className="text-xs text-owed">
                  Outside usual range ({f.min}–{f.max})
                </p>
              )}
              {showGrowth && (
                <Input
                  placeholder="Growth allowance"
                  inputMode="decimal"
                  className="mt-1"
                  value={growth[f.key] ?? ""}
                  onChange={(e) => setGrowth((g) => ({ ...g, [f.key]: e.target.value }))}
                />
              )}
            </div>
          );
        })}
      </div>

      {ratioWarnings.length > 0 && (
        <div className="space-y-1 rounded-xl border border-owed/40 bg-owed/10 p-3">
          {ratioWarnings.map((w) => (
            <p key={w} className="text-xs text-owed">
              {w}
            </p>
          ))}
        </div>
      )}

      <ExtraFieldsEditor value={extraFields} onChange={setExtraFields} />

      <div className="space-y-2">
        <Label htmlFor="measurement-notes">Notes</Label>
        <Textarea
          id="measurement-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
        />
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" className="flex-1" disabled={busy}>
          {busy ? "Saving..." : "Save measurements"}
        </Button>
      </div>
    </form>
  );
}

function ExtraFieldsEditor({
  value,
  onChange,
}: {
  value: { label: string; value: string }[];
  onChange: (value: { label: string; value: string }[]) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Extra measurements</Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange([...value, { label: "", value: "" }])}
        >
          + Add
        </Button>
      </div>
      {value.map((row, i) => (
        <div key={i} className="flex gap-2">
          <Input
            placeholder="Label"
            value={row.label}
            onChange={(e) =>
              onChange(value.map((r, idx) => (idx === i ? { ...r, label: e.target.value } : r)))
            }
          />
          <Input
            placeholder="Value"
            inputMode="decimal"
            value={row.value}
            onChange={(e) =>
              onChange(value.map((r, idx) => (idx === i ? { ...r, value: e.target.value } : r)))
            }
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove"
            onClick={() => onChange(value.filter((_, idx) => idx !== i))}
          >
            <X className="size-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}
