import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { reportDirectoryListing } from "@/lib/directory.functions";
import { getErrorMessage } from "@/lib/utils";

const REASONS = [
  "This shop doesn't seem real",
  "Wrong or misleading information",
  "Inappropriate content",
  "Something else",
];

export function DirectoryReportDialog({
  open,
  onOpenChange,
  storeId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
}) {
  const [reason, setReason] = useState(REASONS[0] as string);
  const [details, setDetails] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    setBusy(true);
    try {
      const result = await reportDirectoryListing({
        data: {
          storeId,
          reason,
          details: details.trim() || undefined,
          reporterContact: contact.trim() || undefined,
        },
      });
      if (!result.ok) {
        toast.error(result.error ?? "Could not send this report");
        return;
      }
      toast.success("Thanks — we'll take a look");
      onOpenChange(false);
      setDetails("");
      setContact("");
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not send this report"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report this listing</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="report-details">Details (optional)</Label>
            <Textarea
              id="report-details"
              rows={3}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="report-contact">Your contact (optional)</Label>
            <Input
              id="report-contact"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="In case we need to follow up"
            />
          </div>
        </div>
        <DialogFooter>
          <Button className="w-full" disabled={busy} onClick={handleSubmit}>
            {busy ? "Sending..." : "Send report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
