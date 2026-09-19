import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { StitchDivider } from "./stitch-divider";

export function EmptyState({
  illustration,
  title,
  description,
  action,
  className,
}: {
  illustration?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex max-w-sm flex-col items-center px-6 py-14 text-center",
        className,
      )}
    >
      <div className="mb-6 flex size-24 items-center justify-center rounded-full border border-border bg-card text-gold">
        {illustration ?? <ThreadMark />}
      </div>
      <h2 className="text-xl">{title}</h2>
      <StitchDivider className="my-4 w-16" />
      <p className="text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

function ThreadMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-10" fill="none" aria-hidden>
      <path
        d="M8 34c8-16 24-16 32 0"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="4 4"
        strokeLinecap="round"
      />
      <circle cx="24" cy="14" r="3.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M24 17.5V30" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
