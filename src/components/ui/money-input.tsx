import * as React from "react";
import { Input } from "@/components/ui/input";

/** Strips to digits + at most one decimal point. Result has no commas. */
function sanitize(raw: string): string {
  let cleaned = raw.replace(/[^\d.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot !== -1) {
    cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
  }
  return cleaned;
}

function withCommas(raw: string): string {
  const [intPart = "", decPart] = raw.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decPart !== undefined ? `${grouped}.${decPart}` : grouped;
}

/**
 * A money amount input: displays thousand-separated commas and allows one
 * decimal point (e.g. typing "50000" shows "50,000"), while the value/onChange
 * contract stays a plain digit string like "50000" or "50000.5" - safe to
 * pass straight to Number().
 */
const MoneyInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> & {
    value: string;
    onChange: (value: string) => void;
  }
>(({ value, onChange, ...props }, ref) => {
  return (
    <Input
      {...props}
      ref={ref}
      inputMode="decimal"
      value={withCommas(sanitize(value))}
      onChange={(e) => onChange(sanitize(e.target.value))}
    />
  );
});
MoneyInput.displayName = "MoneyInput";

export { MoneyInput };
