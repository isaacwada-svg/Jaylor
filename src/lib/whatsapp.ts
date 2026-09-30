import { formatMoney } from "@/lib/jaylor";

export function whatsappLink(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName;
}

export function orderReadyMessage(
  clientName: string,
  garment: string,
  storeName: string,
  balance: number,
  trackingUrl?: string | null,
): string {
  const balanceLine = balance > 0 ? ` Balance: ${formatMoney(balance)}.` : "";
  const trackingLine = trackingUrl ? ` Track your order: ${trackingUrl}` : "";
  return `Hello ${firstNameOf(clientName)}, your ${garment} is ready at ${storeName}.${balanceLine} Reply STOP to opt out.${trackingLine}`;
}

export function balanceDueMessage(
  clientName: string,
  garment: string,
  storeName: string,
  balance: number,
  trackingUrl?: string | null,
): string {
  const trackingLine = trackingUrl ? ` Track your order: ${trackingUrl}` : "";
  return `Hello ${firstNameOf(clientName)}, your balance for ${garment} at ${storeName} is ${formatMoney(balance)}. Reply STOP to opt out.${trackingLine}`;
}

export function approvalRequestMessage(
  clientName: string,
  garment: string,
  storeName: string,
  approvalUrl: string,
): string {
  return `Hello ${firstNameOf(clientName)}, before we start cutting your ${garment} at ${storeName}, please review and approve the details here: ${approvalUrl}`;
}

/** Sent once, right after an order is created. */
export function orderConfirmationMessage(
  clientName: string,
  garment: string,
  storeName: string,
  trackingUrl: string,
): string {
  return `Hello ${firstNameOf(clientName)}, thank you for your order (${garment}) with ${storeName}. Track its progress here: ${trackingUrl}`;
}

/** A self-reminder message, tap-to-send to the shop's own WhatsApp number. */
export function seasonAlertMessage(
  eventLabel: string,
  weeksAway: number,
  suggestion: string | null,
): string {
  const whenText =
    weeksAway <= 0 ? "is this week" : `is in ${weeksAway} week${weeksAway === 1 ? "" : "s"}`;
  const suggestionLine = suggestion ? ` ${suggestion}` : "";
  return `Reminder: ${eventLabel} ${whenText}.${suggestionLine}`;
}
