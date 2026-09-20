import { cn } from "@/lib/utils";

/** A simplified, illustrative phone frame used for marketing screenshots — not a real screen capture. */
export function PhoneMockup({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex aspect-[9/18] w-full max-w-[200px] flex-col gap-2 rounded-[1.75rem] border-4 border-ink bg-card p-3 shadow-sm",
        className,
      )}
    >
      <div className="mx-auto h-1 w-10 rounded-full bg-border" aria-hidden />
      <div className="flex flex-1 flex-col gap-2 overflow-hidden rounded-xl bg-background p-2">
        {children}
      </div>
    </div>
  );
}

export function MockBar({
  width = "100%",
  tone = "muted",
}: {
  width?: string;
  tone?: "muted" | "gold" | "paid" | "owed";
}) {
  const toneClass =
    tone === "gold"
      ? "bg-gold/70"
      : tone === "paid"
        ? "bg-paid/60"
        : tone === "owed"
          ? "bg-owed/60"
          : "bg-border";
  return <div className={cn("h-2 rounded-full", toneClass)} style={{ width }} aria-hidden />;
}

export function MockCard({ children }: { children?: React.ReactNode }) {
  return (
    <div className="space-y-1.5 rounded-lg border border-border/70 bg-card p-2">{children}</div>
  );
}
