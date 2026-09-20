/**
 * A manually-reviewed approximate rate, shown only as a rough guide for clients paying
 * from abroad — Paystack's own card conversion at checkout is the real, final rate.
 * Update this figure occasionally; it is not read from a live feed.
 */
export const APPROX_USD_NGN_RATE = 1600;
export const APPROX_RATE_REVIEWED_ON = "2026-09-20";

export function approximateUsd(ngn: number): string {
  const usd = ngn / APPROX_USD_NGN_RATE;
  return usd.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}
