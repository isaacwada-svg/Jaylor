import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { TierBadge } from "./tier-badge";
import { StitchDivider } from "./stitch-divider";
import type { Tier } from "@/lib/jaylor";

export function FeatureLimitSheet({
  open,
  onOpenChange,
  requiredTier,
  message,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requiredTier: Tier;
  message: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader className="text-left">
          <div className="flex items-center gap-2">
            <TierBadge tier={requiredTier} />
          </div>
          <SheetTitle className="text-2xl">You&apos;re busy!</SheetTitle>
          <SheetDescription>{message}</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4">
          <StitchDivider className="my-5" />
          <Button
            className="w-full"
            onClick={() => toast("Billing isn't set up yet — coming soon")}
          >
            Upgrade to {requiredTier}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
