export function computeQuoteTotal(
  quantity: number,
  unitPrice: number,
  discountPercent: number,
): { subtotal: number; discountAmount: number; total: number } {
  const subtotal = quantity * unitPrice;
  const discountAmount = Math.round(subtotal * (discountPercent / 100));
  return { subtotal, discountAmount, total: subtotal - discountAmount };
}

export function quoteStatusLabel(status: string, expired: boolean): string {
  if (expired && (status === "draft" || status === "sent")) return "Expired";
  switch (status) {
    case "draft":
      return "Draft";
    case "sent":
      return "Sent";
    case "accepted":
      return "Accepted";
    case "expired":
      return "Expired";
    case "converted":
      return "Converted to order";
    default:
      return status;
  }
}
