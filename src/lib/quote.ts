/** Pure quote/invoice math, shared by the creator form, the document and the guest page. */

export function computeQuoteTotals(
  quantity: number,
  unitPrice: number,
  vatEnabled: boolean,
  vatPercent: number,
) {
  const subtotal = quantity * unitPrice;
  const vatAmount = vatEnabled ? Math.round(subtotal * (vatPercent / 100)) : 0;
  const total = subtotal + vatAmount;
  return { subtotal, vatAmount, total };
}

/** Single-payer jobs (contracts) get a capped fee so a large PO doesn't look absurd. */
export function singlePayerFee(total: number): number {
  return Math.min(Math.round(total * 0.01), 20000);
}

export function nextInvoiceNumber(eventId: string): string {
  return `INV-${eventId.slice(0, 8).toUpperCase()}`;
}
