import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TierBadge } from "@/components/jaylor/tier-badge";
import { planCodeToTier } from "@/lib/jaylor";

/** Drop-in replacement for a "New X" button when a plan-gated feature isn't
 *  allowed -- same upgrade/paywall wording as the full-page EmptyState used
 *  by payroll.tsx/inventory.tsx, just sized for inline use next to a list. */
export function UpgradeButton({
  requiredPlan,
  label,
  className,
}: {
  requiredPlan?: string | null | undefined;
  label?: string;
  className?: string;
}) {
  const tier = planCodeToTier(requiredPlan ?? "growth");
  return (
    <div className={`flex shrink-0 items-center gap-2 ${className ?? ""}`}>
      <TierBadge tier={tier} />
      <Button
        variant="outline"
        size="sm"
        onClick={() => toast("Billing isn't set up yet — coming soon")}
      >
        {label ?? `Upgrade to ${tier}`}
      </Button>
    </div>
  );
}
