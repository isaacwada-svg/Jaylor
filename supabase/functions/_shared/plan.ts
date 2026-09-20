/** Jaylor Pay platform fee, mirroring src/lib/pricing-content.ts's jaylorPayFee column. */
export function planFeePercent(planCode: string | null, trialEndsAt: string | null): number {
  if (trialEndsAt && new Date(trialEndsAt) > new Date()) return 1; // on the Growth trial
  switch (planCode) {
    case "free":
      return 1.5;
    case "business":
      return 0.7;
    case "custom":
      return 1; // negotiated elsewhere; default conservatively to Growth's rate
    default:
      return 1; // growth
  }
}
