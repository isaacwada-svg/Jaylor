import { WifiOff } from "lucide-react";

/** Inline notice for forms that need a live connection and don't queue offline. */
export function OfflineNotice({
  label = "This needs an internet connection.",
}: {
  label?: string;
}) {
  return (
    <p className="flex items-center gap-1.5 rounded-lg bg-owed/10 px-3 py-2 text-xs text-owed">
      <WifiOff className="size-3.5 shrink-0" />
      {label}
    </p>
  );
}
