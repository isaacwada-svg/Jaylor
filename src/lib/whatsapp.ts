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
): string {
  const balanceLine = balance > 0 ? ` Balance: ${formatMoney(balance)}.` : "";
  return `Hello ${firstNameOf(clientName)}, your ${garment} is ready at ${storeName}.${balanceLine} Reply STOP to opt out.`;
}

export function balanceDueMessage(
  clientName: string,
  garment: string,
  storeName: string,
  balance: number,
): string {
  return `Hello ${firstNameOf(clientName)}, your balance for ${garment} at ${storeName} is ${formatMoney(balance)}. Reply STOP to opt out.`;
}
