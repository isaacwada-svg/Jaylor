import { formatMoney } from "@/lib/jaylor";
import { DEFAULT_LANGUAGE, isLanguageCode, type LanguageCode } from "@/lib/i18n/languages";

function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName;
}

/** Client's preferred_language if set, else the shop's own language, else
 *  English -- the exact fallback the spec asks for tap-to-send messages. */
export function resolveMessageLanguage(
  clientPreferredLanguage: string | null | undefined,
  storeLanguage: string | null | undefined,
): LanguageCode {
  if (isLanguageCode(clientPreferredLanguage)) return clientPreferredLanguage;
  if (isLanguageCode(storeLanguage)) return storeLanguage;
  return DEFAULT_LANGUAGE;
}

type Strings = {
  trackingLine: (url: string) => string;
  orderConfirmation: (name: string, garment: string, store: string, url: string) => string;
  orderReady: (
    name: string,
    garment: string,
    store: string,
    balanceLine: string,
    trackingLine: string,
  ) => string;
  balanceLine: (amount: string) => string;
  balanceDue: (
    name: string,
    garment: string,
    store: string,
    amount: string,
    trackingLine: string,
  ) => string;
  approvalRequest: (name: string, garment: string, store: string, url: string) => string;
};

const STRINGS: Record<LanguageCode, Strings> = {
  en: {
    trackingLine: (url) => ` Track your order: ${url}`,
    orderConfirmation: (name, garment, store, url) =>
      `Hello ${name}, thank you for your order (${garment}) with ${store}. Track its progress here: ${url}`,
    orderReady: (name, garment, store, balanceLine, trackingLine) =>
      `Hello ${name}, your ${garment} is ready at ${store}.${balanceLine} Reply STOP to opt out.${trackingLine}`,
    balanceLine: (amount) => ` Balance: ${amount}.`,
    balanceDue: (name, garment, store, amount, trackingLine) =>
      `Hello ${name}, your balance for ${garment} at ${store} is ${amount}. Reply STOP to opt out.${trackingLine}`,
    approvalRequest: (name, garment, store, url) =>
      `Hello ${name}, before we start cutting your ${garment} at ${store}, please review and approve the details here: ${url}`,
  },
  pcm: {
    trackingLine: (url) => ` Track your order here: ${url}`,
    orderConfirmation: (name, garment, store, url) =>
      `Hello ${name}, thank you for your order (${garment}) with ${store}. Track how e dey go here: ${url}`,
    orderReady: (name, garment, store, balanceLine, trackingLine) =>
      `Hello ${name}, your ${garment} don ready for ${store}.${balanceLine} Reply STOP make you opt out.${trackingLine}`,
    balanceLine: (amount) => ` Balance: ${amount}.`,
    balanceDue: (name, garment, store, amount, trackingLine) =>
      `Hello ${name}, your balance for ${garment} for ${store} na ${amount}. Reply STOP make you opt out.${trackingLine}`,
    approvalRequest: (name, garment, store, url) =>
      `Hello ${name}, before we start to cut your ${garment} for ${store}, abeg check am approve di details here: ${url}`,
  },
  ha: {
    trackingLine: (url) => ` Bibiyi odarka: ${url}`,
    orderConfirmation: (name, garment, store, url) =>
      `Sannu ${name}, na gode don odarka (${garment}) tare da ${store}. Bibiyi ci gabanta a nan: ${url}`,
    orderReady: (name, garment, store, balanceLine, trackingLine) =>
      `Sannu ${name}, ${garment} naka ya shirya a ${store}.${balanceLine} Amsa STOP don fita.${trackingLine}`,
    balanceLine: (amount) => ` Sauran kudi: ${amount}.`,
    balanceDue: (name, garment, store, amount, trackingLine) =>
      `Sannu ${name}, sauran kudin ${garment} a ${store} shine ${amount}. Amsa STOP don fita.${trackingLine}`,
    approvalRequest: (name, garment, store, url) =>
      `Sannu ${name}, kafin mu fara yanke ${garment} naka a ${store}, da fatan ka duba ka amince da bayanan a nan: ${url}`,
  },
  yo: {
    trackingLine: (url) => ` Tọpinpin ẹ̀bùn rẹ: ${url}`,
    orderConfirmation: (name, garment, store, url) =>
      `Pẹ̀lẹ́ o ${name}, o ṣeun fún ẹ̀bùn rẹ (${garment}) pẹ̀lú ${store}. Tọpinpin ìtẹ̀síwájú rẹ̀ níhìn-ín: ${url}`,
    orderReady: (name, garment, store, balanceLine, trackingLine) =>
      `Pẹ̀lẹ́ o ${name}, ${garment} rẹ ti ṣetán ní ${store}.${balanceLine} Dáhùn STOP láti jáwọ́.${trackingLine}`,
    balanceLine: (amount) => ` Ìyókù owó: ${amount}.`,
    balanceDue: (name, garment, store, amount, trackingLine) =>
      `Pẹ̀lẹ́ o ${name}, ìyókù owó fún ${garment} ní ${store} jẹ́ ${amount}. Dáhùn STOP láti jáwọ́.${trackingLine}`,
    approvalRequest: (name, garment, store, url) =>
      `Pẹ̀lẹ́ o ${name}, kí á tó bẹ̀rẹ̀ gé aṣọ ${garment} rẹ ní ${store}, jọ̀wọ́ ṣàyẹ̀wò kí o sì fọwọ́ sí àlàyé níhìn-ín: ${url}`,
  },
  ig: {
    trackingLine: (url) => ` Soro ihe ị tinyere n'aka: ${url}`,
    orderConfirmation: (name, garment, store, url) =>
      `Ndewo ${name}, daalụ maka ihe ịtinye n'aka gị (${garment}) na ${store}. Soro ọganihu ya ebe a: ${url}`,
    orderReady: (name, garment, store, balanceLine, trackingLine) =>
      `Ndewo ${name}, ${garment} gị adịla njikere na ${store}.${balanceLine} Zaa STOP iji hapụ.${trackingLine}`,
    balanceLine: (amount) => ` Ego fọdụrụ: ${amount}.`,
    balanceDue: (name, garment, store, amount, trackingLine) =>
      `Ndewo ${name}, ego fọdụrụ maka ${garment} na ${store} bụ ${amount}. Zaa STOP iji hapụ.${trackingLine}`,
    approvalRequest: (name, garment, store, url) =>
      `Ndewo ${name}, tupu anyị amalite ịbọ ${garment} gị na ${store}, biko nyochaa ma kwado nkọwa ebe a: ${url}`,
  },
};

export function orderConfirmationMessageI18n(
  lang: LanguageCode,
  clientName: string,
  garment: string,
  storeName: string,
  trackingUrl: string,
): string {
  return STRINGS[lang].orderConfirmation(firstNameOf(clientName), garment, storeName, trackingUrl);
}

export function orderReadyMessageI18n(
  lang: LanguageCode,
  clientName: string,
  garment: string,
  storeName: string,
  balance: number,
  trackingUrl?: string | null,
): string {
  const s = STRINGS[lang];
  const balanceLine = balance > 0 ? s.balanceLine(formatMoney(balance)) : "";
  const trackingLine = trackingUrl ? s.trackingLine(trackingUrl) : "";
  return s.orderReady(firstNameOf(clientName), garment, storeName, balanceLine, trackingLine);
}

export function balanceDueMessageI18n(
  lang: LanguageCode,
  clientName: string,
  garment: string,
  storeName: string,
  balance: number,
  trackingUrl?: string | null,
): string {
  const s = STRINGS[lang];
  const trackingLine = trackingUrl ? s.trackingLine(trackingUrl) : "";
  return s.balanceDue(
    firstNameOf(clientName),
    garment,
    storeName,
    formatMoney(balance),
    trackingLine,
  );
}

export function approvalRequestMessageI18n(
  lang: LanguageCode,
  clientName: string,
  garment: string,
  storeName: string,
  approvalUrl: string,
): string {
  return STRINGS[lang].approvalRequest(firstNameOf(clientName), garment, storeName, approvalUrl);
}
