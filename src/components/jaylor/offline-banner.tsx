import { useEffect } from "react";
import { toast } from "sonner";
import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/lib/use-online-status";
import { usePendingOutbox, type OutboxEntry } from "@/lib/offline/outbox";
import { getErrorMessage } from "@/lib/utils";

export function OfflineBanner({ storeId }: { storeId: string | undefined }) {
  const online = useOnlineStatus();
  const pending = usePendingOutbox(storeId);

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
    window.addEventListener("jaylor:offline-synced", onSynced);
    window.addEventListener("jaylor:offline-sync-failed", onFailed);
    return () => {
      window.removeEventListener("jaylor:offline-synced", onSynced);
      window.removeEventListener("jaylor:offline-sync-failed", onFailed);
    };
  }, []);

  if (online && pending.length === 0) return null;

  const message = !online
    ? pending.length > 0
      ? `Offline — ${pending.length} change${pending.length === 1 ? "" : "s"} saved, will sync when you're back online`
      : "Offline — you can still take orders, add clients, record payments and save measurements"
    : `Syncing ${pending.length} change${pending.length === 1 ? "" : "s"}...`;

  return (
    <div className="sticky top-0 z-40 flex items-center justify-center gap-2 border-b border-owed/30 bg-owed/10 px-4 py-2 text-center text-xs font-medium text-owed">
      <WifiOff className="size-3.5 shrink-0" />
      {message}
    </div>
  );
}
