import { TriangleAlert } from "lucide-react";
import { useOrderCapacityCheck } from "@/lib/use-capacity";
import { useOnlineStatus } from "@/lib/use-online-status";

/** Shown under a delivery-date field once a date is chosen. Non-blocking --
 *  it only ever informs, never prevents the save. */
export function CapacityWarning({
  storeId,
  date,
}: {
  storeId: string | undefined;
  date: string | null;
}) {
  const online = useOnlineStatus();
  const { data: check } = useOrderCapacityCheck(storeId, date);

  if (!date) return null;
  if (!online) {
    return <p className="mt-1 text-xs text-muted-foreground">Capacity check unavailable offline</p>;
  }
  if (!check || check.capacity == null || !check.overloaded) return null;

  return (
    <p className="mt-1 flex items-start gap-1.5 text-xs text-owed">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
      <span>
        That week already has {check.garments_due} garment{check.garments_due === 1 ? "" : "s"} due
        against a capacity of about {check.capacity}.
        {check.suggested_week &&
          ` The week of ${new Date(check.suggested_week).toLocaleDateString()} has room.`}
      </span>
    </p>
  );
}
