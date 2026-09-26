import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { TERMS_LAST_UPDATED, TermsBody } from "./terms-content";

const SCROLL_END_THRESHOLD_PX = 24;

export function TermsGateDialog({
  open,
  onOpenChange,
  onAccept,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccept: () => void;
  busy: boolean;
}) {
  const [reachedEnd, setReachedEnd] = useState(false);
  const [checked, setChecked] = useState(false);

  function handleScroll(event: React.UIEvent<HTMLDivElement>) {
    if (reachedEnd) return;
    const el = event.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_END_THRESHOLD_PX) {
      setReachedEnd(true);
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      setReachedEnd(false);
      setChecked(false);
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Terms of Service</DialogTitle>
          <DialogDescription>
            Please read the full terms below before creating your Jaylor account.
          </DialogDescription>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">Last updated: {TERMS_LAST_UPDATED}</p>

        <div
          onScroll={handleScroll}
          className="mt-2 min-h-0 flex-1 overflow-y-auto rounded-lg border border-border p-4 text-sm leading-relaxed [&_h2]:mt-6 [&_h2]:font-heading [&_h2]:text-base [&_h2:first-child]:mt-0 [&_p]:mt-1 [&_p]:text-muted-foreground [&_ul]:mt-1 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_ul]:text-muted-foreground"
        >
          <TermsBody />
        </div>

        <div className="mt-3 space-y-2">
          {!reachedEnd && (
            <p className="text-xs text-muted-foreground">
              Scroll to the end of the terms to enable the checkbox below.
            </p>
          )}
          <div className="flex items-start gap-2">
            <Checkbox
              id="terms-agree"
              checked={checked}
              disabled={!reachedEnd}
              onCheckedChange={(value) => setChecked(value === true)}
              className="mt-0.5"
            />
            <Label htmlFor="terms-agree" className="text-sm font-normal leading-snug">
              I have read and agree to the Terms of Service, including the Jaylor Pay payment terms,
              and the{" "}
              <Link
                to="/privacy-policy"
                target="_blank"
                className="underline underline-offset-4 hover:text-foreground"
              >
                Privacy Policy
              </Link>
              .
            </Label>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button type="button" onClick={onAccept} disabled={!checked || busy}>
            {busy ? "Creating account..." : "Agree & create account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
