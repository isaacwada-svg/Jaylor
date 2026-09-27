import { useEffect } from "react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { WifiOff, TriangleAlert } from "lucide-react";
import { useOnlineStatus } from "@/lib/use-online-status";
import { usePendingOutbox, type OutboxEntry } from "@/lib/offline/outbox";
import { getErrorMessage } from "@/lib/utils";

export function OfflineBanner({ storeId }: { storeId: string | undefined }) {
  const online = useOnlineStatus();
  const pending = usePendingOutbox(storeId);
  const blocked = pending.filter((e) => e.blockedByLimit);
  const syncing = pending.filter((e) => !e.blockedByLimit);

  useEffect(() => {
    function onSynced(event: Event) {
      const entry = (event as CustomEvent<OutboxEntry>).detail;
      toast.success(`Synced: ${entry.label}`);
    }
    function onFailed(event: Event) {
      const { entry, error } = (event as CustomEvent<{ entry: OutboxEntry; error: unknown }>)
        .detail;
      toast.error(`Could not sync "${entry.label}": ${getErrorMessage(error, "please redo it")}`);
    }
    function onBlocked(event: Event) {
      const entry = (event as CustomEvent<OutboxEntry>).detail;
      toast.error(`"${entry.label}" is saved but over your plan's order limit for this month.`);
    }
    window.addEventListener("jaylor:offline-synced", onSynced);
    window.addEventListener("jaylor:offline-sync-failed", onFailed);
    window.addEventListener("jaylor:offline-blocked-by-limit", onBlocked);
    return () => {
      window.removeEventListener("jaylor:offline-synced", onSynced);
      window.removeEventListener("jaylor:offline-sync-failed", onFailed);
      window.removeEventListener("jaylor:offline-blocked-by-limit", onBlocked);
    };
  }, []);

  const showOnlineStatus = !online || syncing.length > 0;
  if (blocked.length === 0 && !showOnlineStatus) return null;

  const onlineMessage = !online
    ? syncing.length > 0
      ? `Offline — ${syncing.length} change${syncing.length === 1 ? "" : "s"} saved, will sync when you're back online`
      : "Offline — you can still take orders, add clients, record payments and save measurements"
    : `Syncing ${syncing.length} change${syncing.length === 1 ? "" : "s"}...`;

  return (
    <div className="sticky top-0 z-40 divide-y divide-owed/30 border-b border-owed/30 bg-owed/10 text-center text-xs font-medium text-owed">
      {blocked.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-2 px-4 py-2">
          <TriangleAlert className="size-3.5 shrink-0" />
          {blocked.length} saved order{blocked.length === 1 ? "" : "s"} over this month's plan limit
          — not yet synced.
          <Link to="/billing" className="underline underline-offset-2">
            Upgrade
          </Link>
        </div>
      )}
      {showOnlineStatus && (
        <div className="flex items-center justify-center gap-2 px-4 py-2">
          <WifiOff className="size-3.5 shrink-0" />
          {onlineMessage}
        </div>
      )}
    </div>
  );
}
