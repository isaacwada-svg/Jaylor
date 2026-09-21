import { cn } from "@/lib/utils";

/** The Jaylor name set in the official display face. */
export function Wordmark({ className }: { className?: string }) {
  return <span className={cn("font-heading", className)}>Jaylor</span>;
}
