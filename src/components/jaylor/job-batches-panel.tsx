import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, MessageCircle, Camera } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { resizeImageFile } from "@/lib/image";
import { whatsappLink } from "@/lib/whatsapp";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

type ParticipantRow = Tables<"event_participants">;
type BatchRow = Tables<"event_batches">;

const STAGES: { value: string; label: string }[] = [
  { value: "cut", label: "Cut" },
  { value: "sewn", label: "Sewn" },
  { value: "finished", label: "Finished" },
  { value: "delivered", label: "Delivered" },
];

type DeliveryTarget =
  { type: "batch"; batch: BatchRow } | { type: "participant"; participant: ParticipantRow };

/**
 * Production batches from the doc's G4 step: split a large job (100
 * uniforms delivered in 4 batches, say) into groups with their own
 * deadlines, track cut/sewn/finished/delivered counts, and capture who
 * collected a delivery.
 */
export function JobBatchesPanel({
  eventId,
  storeId,
  canManage,
  participants,
  organiserPhone,
  jobName,
  onChanged,
}: {
  eventId: string;
  storeId: string;
  canManage: boolean;
  participants: ParticipantRow[];
  organiserPhone: string | null;
  jobName: string;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [deadline, setDeadline] = useState("");
  const [busy, setBusy] = useState(false);
  const [deliveryTarget, setDeliveryTarget] = useState<DeliveryTarget | null>(null);
  const [collectedBy, setCollectedBy] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  const { data: batches } = useQuery({
    queryKey: ["event-batches", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_batches")
        .select("*")
        .eq("event_id", eventId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  function invalidateBatches() {
    queryClient.invalidateQueries({ queryKey: ["event-batches", eventId] });
  }

  async function createBatch(formEvent: FormEvent) {
    formEvent.preventDefault();
    if (!label.trim()) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("event_batches").insert({
        event_id: eventId,
        store_id: storeId,
        label: label.trim(),
        deadline: deadline || null,
        sort_order: (batches?.length ?? 0) + 1,
      });
      if (error) throw error;
      toast.success("Batch added");
      setLabel("");
      setDeadline("");
      setCreateOpen(false);
      invalidateBatches();
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not add this batch"));
    } finally {
      setBusy(false);
    }
  }

  async function assignBatch(participant: ParticipantRow, batchId: string) {
    try {
      const { error } = await supabase
        .from("event_participants")
        .update({ batch_id: batchId === "none" ? null : batchId })
        .eq("id", participant.id);
      if (error) throw error;
      onChanged();
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not move this guest"));
    }
  }

  async function advanceBatch(batch: BatchRow, stage: string) {
    if (stage === "delivered") {
      setDeliveryTarget({ type: "batch", batch });
      return;
    }
    try {
      const { error } = await supabase
        .from("event_participants")
        .update({ production_stage: stage })
        .eq("batch_id", batch.id);
      if (error) throw error;
      onChanged();
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not update this batch"));
    }
  }

  async function confirmDelivery() {
    if (!deliveryTarget) return;
    setBusy(true);
    try {
      let photoPath: string | null = null;
      if (photoFile) {
        const resized = await resizeImageFile(photoFile, 1200, 0.8);
        const path = `${storeId}/delivery-${crypto.randomUUID()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from("storefront-photos")
          .upload(path, resized, { contentType: "image/jpeg", upsert: false });
        if (uploadError) throw uploadError;
        photoPath = path;
      }

      const patch = {
        production_stage: "delivered",
        delivered_at: new Date().toISOString(),
        delivered_to: collectedBy.trim() || null,
        delivery_photo_url: photoPath,
      };

      if (deliveryTarget.type === "batch") {
        const { error } = await supabase
          .from("event_participants")
          .update(patch)
          .eq("batch_id", deliveryTarget.batch.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("event_participants")
          .update(patch)
          .eq("id", deliveryTarget.participant.id);
        if (error) throw error;
      }

      toast.success("Marked delivered");
      setDeliveryTarget(null);
      setCollectedBy("");
      setPhotoFile(null);
      onChanged();
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not record this delivery"));
    } finally {
      setBusy(false);
    }
  }

  if (!batches || (batches.length === 0 && !canManage)) return null;

  const unassigned = participants.filter((p) => !p.batch_id);

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Batches</p>
        {canManage && (
          <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            New batch
          </Button>
        )}
      </div>

      {batches.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Split this job into production batches, each with its own deadline.
        </p>
      ) : (
        <div className="mt-2 space-y-3">
          {batches.map((batch) => {
            const inBatch = participants.filter((p) => p.batch_id === batch.id);
            const stageCounts: Record<string, number> = {};
            for (const s of STAGES) stageCounts[s.value] = 0;
            for (const p of inBatch) {
              if (p.production_stage)
                stageCounts[p.production_stage] = (stageCounts[p.production_stage] ?? 0) + 1;
            }
            const delivered =
              inBatch.length > 0 && inBatch.every((p) => p.production_stage === "delivered");

            return (
              <div key={batch.id} className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{batch.label}</p>
                  {batch.deadline && (
                    <span className="text-xs text-muted-foreground">
                      Due {new Date(batch.deadline).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2 text-center text-xs">
                  {STAGES.map((s) => (
                    <div key={s.value} className="rounded-lg bg-accent/40 p-1.5">
                      <p className="figures font-medium">{stageCounts[s.value] ?? 0}</p>
                      <p className="text-muted-foreground">{s.label}</p>
                    </div>
                  ))}
                </div>
                {canManage && inBatch.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {STAGES.map((s) => (
                      <Button
                        key={s.value}
                        size="sm"
                        variant="outline"
                        onClick={() => advanceBatch(batch, s.value)}
                      >
                        Mark all {s.label.toLowerCase()}
                      </Button>
                    ))}
                    {delivered && organiserPhone && (
                      <Button size="sm" variant="outline" asChild>
                        <a
                          href={whatsappLink(
                            organiserPhone,
                            `Hi, ${batch.label} for ${jobName} has been delivered.`,
                          )}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <MessageCircle className="size-4" />
                          Notify payer
                        </a>
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {canManage && (
            <div className="rounded-xl border border-dashed border-border p-3">
              <p className="text-xs font-medium text-muted-foreground">
                {unassigned.length === 0
                  ? "All guests are assigned to a batch"
                  : "Assign to a batch"}
              </p>
              {unassigned.length > 0 && (
                <div className="mt-2 space-y-2">
                  {unassigned.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm">{p.full_name}</span>
                      <Select onValueChange={(v) => assignBatch(p, v)}>
                        <SelectTrigger className="w-36">
                          <SelectValue placeholder="Choose batch" />
                        </SelectTrigger>
                        <SelectContent>
                          {batches.map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New batch</DialogTitle>
          </DialogHeader>
          <form onSubmit={createBatch} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="batch-label">Label</Label>
              <Input
                id="batch-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Batch 1 of 4"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="batch-deadline">Deadline</Label>
              <Input
                id="batch-deadline"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy || !label.trim()}>
              {busy ? "Adding..." : "Add batch"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deliveryTarget} onOpenChange={(open) => !open && setDeliveryTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Mark {deliveryTarget?.type === "batch" ? deliveryTarget.batch.label : "delivered"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="collected-by">Collected by</Label>
              <Input
                id="collected-by"
                value={collectedBy}
                onChange={(e) => setCollectedBy(e.target.value)}
                placeholder="Name of who picked it up"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="delivery-photo">Photo (optional)</Label>
              <div className="flex items-center gap-2">
                <Camera className="size-4 text-muted-foreground" />
                <Input
                  id="delivery-photo"
                  type="file"
                  accept="image/*"
                  onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeliveryTarget(null)}>
              Cancel
            </Button>
            <Button onClick={confirmDelivery} disabled={busy}>
              {busy ? "Saving..." : "Confirm delivered"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
