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

export function fittingBookingLinkMessage(
  clientName: string,
  storeName: string,
  link: string,
): string {
  return `Hi ${firstNameOf(clientName)}, please pick a time for your fitting at ${storeName}: ${link}`;
}

export function fittingReminderMessage(clientName: string, storeName: string, when: Date): string {
  return `Hi ${firstNameOf(clientName)}, just a reminder of your fitting at ${storeName} on ${when.toLocaleDateString()} at ${when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`;
}

/** A client tapping "Chat on WhatsApp" from the /tailors directory. */
export function directoryIntroMessage(): string {
  return "Hello, I found your shop on Jaylor.";
}

/** A client sharing their Passport with a specific tailor found in the directory. */
export function directoryPassportShareMessage(passportUrl: string): string {
  return `Hi, here are my measurements from my Jaylor Passport: ${passportUrl}`;
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
