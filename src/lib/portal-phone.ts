/** Phone helpers shared by the customer portal (client + server safe). */

/** Normalise a Nigerian-first phone number to E.164 digits, no leading "+". */
export function normalisePhone(input: string): string | null {
  const digits = (input || "").replace(/\D/g, "");
  if (!digits) return null;
  let value = digits;
  if (value.startsWith("00")) value = value.slice(2);
  if (value.startsWith("0")) value = `234${value.slice(1)}`;
  else if (value.length === 10) value = `234${value}`;
  if (value.length < 10 || value.length > 15) return null;
  return value;
}

/** Pretty form for display, e.g. +234 902 810 1389 */
export function displayPhone(e164: string): string {
  if (e164.startsWith("234") && e164.length === 13) {
    return `+234 ${e164.slice(3, 6)} ${e164.slice(6, 9)} ${e164.slice(9)}`;
  }
  return `+${e164}`;
}

/** Variants used when matching a portal phone against stored client records. */
export function phoneVariants(e164: string): string[] {
  const set = new Set<string>([e164, `+${e164}`]);
  if (e164.startsWith("234")) {
    const local = e164.slice(3);
    set.add(`0${local}`);
    set.add(local);
  }
  return [...set];
}

export const PORTAL_KEYWORD = "JAYLOR LOGIN";
