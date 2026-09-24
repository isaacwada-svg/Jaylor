import { useEffect, useState } from "react";
import { useStore } from "@/lib/store-context";
import {
  useUnacknowledgedMilestones,
  useAcknowledgeMilestone,
  type StoreMilestone,
  type MilestoneKey,
} from "@/lib/milestones";
import { formatMoney } from "@/lib/jaylor";
import { ShareCardDialog } from "@/components/jaylor/share-card-dialog";
import type { ShareCardSpec } from "@/lib/share-card";

function milestoneCardSpec(
  key: MilestoneKey,
  detail: Record<string, unknown> | null,
  storeName: string,
): ShareCardSpec {
  switch (key) {
    case "orders_50":
      return {
        eyebrow: "Milestone",
        headline: "50 orders made",
        subline: "Fifty garments, fifty stories. Thank you for trusting us with each one.",
        storeName,
      };
    case "orders_100":
      return {
        eyebrow: "Milestone",
        headline: "100 orders made",
        subline: "A hundred garments and counting. Every stitch has meant something.",
        storeName,
      };
    case "collected_1m": {
      const amount = typeof detail?.["amount"] === "number" ? detail["amount"] : 1000000;
      return {
        eyebrow: "Milestone",
        headline: formatMoney(amount),
        subline: "Collected, one considered order at a time.",
        storeName,
      };
    }
    case "zero_balance_day":
      return {
        eyebrow: "Milestone",
        headline: "Every balance cleared",
        subline: "Nothing outstanding, nothing chasing. A clean page to build from.",
        storeName,
      };
  }
}

export function MilestoneCelebration({ storeId }: { storeId: string | undefined }) {
  const { currentStore } = useStore();
  const { data: milestones } = useUnacknowledgedMilestones(storeId);
  const acknowledge = useAcknowledgeMilestone(storeId);
  const [shareOpen, setShareOpen] = useState(false);
  const [active, setActive] = useState<StoreMilestone | null>(null);

  const next = milestones?.[0];

  useEffect(() => {
    if (next && next.id !== active?.id && !shareOpen) {
      setActive(next);
      setShareOpen(true);
    }
    // Intentionally omitting `active`/`shareOpen`: this should only react to
    // a new unacknowledged milestone arriving, not to closing the dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next]);

  if (!active) return null;

  const storeName = currentStore?.name ?? "Jaylor";

  return (
    <ShareCardDialog
      open={shareOpen}
      onOpenChange={(open) => {
        setShareOpen(open);
        if (!open) {
          acknowledge.mutate(active.id);
          setActive(null);
        }
      }}
      spec={milestoneCardSpec(active.milestone_key, active.detail, storeName)}
      fileName={`jaylor-${active.milestone_key}.png`}
      showConfetti
    />
  );
}
