import { cn } from "@/lib/utils";

/** The Jaylor "J" tag-and-thread mark. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <img
      src="/logo-mark.png"
      alt=""
      width={64}
      height={64}
      className={cn("shrink-0 rounded-lg", className)}
    />
  );
}
