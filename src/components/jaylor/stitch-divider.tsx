import { cn } from "@/lib/utils";

export function StitchDivider({
  className,
  orientation = "horizontal",
}: {
  className?: string;
  orientation?: "horizontal" | "vertical";
}) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(orientation === "horizontal" ? "stitch-x" : "stitch-y h-full", className)}
    />
  );
}
