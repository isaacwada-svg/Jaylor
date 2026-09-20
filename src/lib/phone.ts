/** Normalizes a Nigerian phone number to E.164 (+234...), or null if invalid. */
export function normalizePhoneNG(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("234")) {
    digits = digits.slice(3);
  } else if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  if (digits.length !== 10) return null;
  return `+234${digits}`;
}

/** Formats an E.164 Nigerian number for display, e.g. +2348031234567 -> 0803 123 4567. */
export function formatPhoneNG(e164: string): string {
  const match = /^\+234(\d{3})(\d{3})(\d{4})$/.exec(e164);
  if (!match) return e164;
  return `0${match[1]} ${match[2]} ${match[3]}`;
}
