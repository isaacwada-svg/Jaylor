import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/jaylor";

export function MoneyText({
  amount,
  currency = "NGN",
  variant = "default",
  className,
}: {
  amount: number;
  currency?: string;
  variant?: "default" | "owed" | "paid" | "muted";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "figures font-medium",
        variant === "owed" && "text-owed",
        variant === "paid" && "text-paid",
        variant === "muted" && "text-muted-foreground",
        className,
      )}
    >
      {formatMoney(amount, currency)}
    </span>
  );
}
