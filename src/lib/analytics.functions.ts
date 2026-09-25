import { createServerFn } from "@tanstack/react-start";

// GA4 measurement IDs are public by design (they appear in every page's HTML);
// it's stored as a secret only for convenience, so exposing it here is safe.
export const getAnalyticsConfig = createServerFn({ method: "GET" }).handler(async () => {
  const raw = (process.env["GOOGLE_ANALYTICS_MEASUREMENT_ID"] ?? "").trim();
  return { ga4Id: /^G-[A-Z0-9]+$/i.test(raw) ? raw : null };
});
