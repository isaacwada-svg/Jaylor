import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const RADIUS = 40;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function CollectionScoreCard({
  score,
  advice,
  actionLabel,
  onAction,
}: {
  score: number;
  advice: string;
  actionLabel?: string | undefined;
  onAction?: (() => void) | undefined;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const offset = CIRCUMFERENCE * (1 - clamped / 100);
  const tone = clamped >= 70 ? "text-paid" : clamped >= 40 ? "text-gold" : "text-owed";

  return (
    <Card className="rounded-2xl">
      <CardContent className="flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:items-center sm:text-left">
        <div className="relative shrink-0">
          <svg width={96} height={96} viewBox="0 0 96 96" className="-rotate-90">
            <circle
              cx={48}
              cy={48}
              r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth={8}
              className="text-border"
            />
            <circle
              cx={48}
              cy={48}
              r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth={8}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={offset}
              className={cn("transition-all duration-500", tone)}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="figures text-2xl font-medium">{clamped}</span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">score</span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium">Collection score</p>
          <p className="mt-1 text-sm text-muted-foreground">{advice}</p>
          {actionLabel && onAction && (
            <Button size="sm" className="mt-3" onClick={onAction}>
              {actionLabel}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
