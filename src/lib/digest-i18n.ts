import { formatMoney } from "@/lib/jaylor";
import { DEFAULT_LANGUAGE, isLanguageCode, type LanguageCode } from "@/lib/i18n/languages";

/** Owner's own ui_language if set, else the shop's language, else English --
 *  same fallback shape as resolveMessageLanguage in whatsapp-i18n.ts, for
 *  the messages that go TO the shop (digests, alerts) rather than to a
 *  client. */
export function resolveOwnerMessageLanguage(
  ownerUiLanguage: string | null | undefined,
  storeLanguage: string | null | undefined,
): LanguageCode {
  if (isLanguageCode(ownerUiLanguage)) return ownerUiLanguage;
  if (isLanguageCode(storeLanguage)) return storeLanguage;
  return DEFAULT_LANGUAGE;
}

type OrderRef = { order_id: string; number: string; garment_type: string; client_name: string };
type LowStockItem = { id: string; name: string; quantity: number; unit: string };
export type DailyDigestData = {
  due_today: OrderRef[];
  due_next_3_days: (OrderRef & { delivery_date: string })[];
  overdue: (OrderRef & { delivery_date: string })[];
  outstanding_total: number;
  top_balances: { client_name: string; balance: number; number: string }[];
  low_stock_items: LowStockItem[];
};
export type WeeklyDigestData = {
  new_orders: number;
  billed: number;
  collected: number;
  outstanding_total: number;
  overdue_count: number;
  garments_due_this_week: number;
  overloaded_weeks: string[];
};

function orderList(orders: OrderRef[]): string {
  return orders.map((o) => `${o.client_name} (${o.number})`).join(", ");
}

const STRINGS: Record<
  LanguageCode,
  {
    dailySubject: string;
    weeklySubject: string;
    transferSubject: string;
    buildDaily: (storeName: string, d: DailyDigestData) => string;
    buildWeekly: (storeName: string, d: WeeklyDigestData) => string;
    buildTransferAlert: (
      amount: string,
      clientName: string,
      orderNumber: string,
      balance: string,
    ) => string;
  }
> = {
  en: {
    dailySubject: "Your Jaylor daily digest",
    weeklySubject: "Your Jaylor weekly digest",
    transferSubject: "Jaylor: transfer received",
    buildDaily: (storeName, d) => {
      const lines = [`Good morning from Jaylor — ${storeName}'s daily digest.`];
      lines.push(
        d.due_today.length > 0
          ? `Due today (${d.due_today.length}): ${orderList(d.due_today)}`
          : "Nothing due today.",
      );
      if (d.due_next_3_days.length > 0) {
        lines.push(
          `Due in the next 3 days (${d.due_next_3_days.length}): ${orderList(d.due_next_3_days)}`,
        );
      }
      if (d.overdue.length > 0) {
        lines.push(`Overdue (${d.overdue.length}): ${orderList(d.overdue)}`);
      }
      lines.push(`Total outstanding: ${formatMoney(d.outstanding_total)}`);
      if (d.top_balances.length > 0) {
        lines.push(
          `Top balances to chase: ${d.top_balances.map((b) => `${b.client_name} ${formatMoney(b.balance)}`).join(", ")}`,
        );
      }
      if (d.low_stock_items?.length > 0) {
        lines.push(
          `Running low: ${d.low_stock_items.map((i) => `${i.name} (${i.quantity} ${i.unit})`).join(", ")}`,
        );
      }
      return lines.join("\n");
    },
    buildWeekly: (storeName, d) => {
      const lines = [
        `${storeName}'s weekly digest.`,
        `New orders: ${d.new_orders} · Billed: ${formatMoney(d.billed)} · Collected: ${formatMoney(d.collected)}`,
        `Outstanding: ${formatMoney(d.outstanding_total)} · Overdue orders: ${d.overdue_count}`,
        `Garments due this week: ${d.garments_due_this_week}`,
      ];
      const firstOverloadedWeek = d.overloaded_weeks?.[0];
      if (firstOverloadedWeek) {
        lines.push(
          `Heads up: ${d.overloaded_weeks.length} of the next 6 weeks are over your usual capacity (starting ${new Date(firstOverloadedWeek).toLocaleDateString()}).`,
        );
      }
      return lines.join("\n");
    },
    buildTransferAlert: (amount, clientName, orderNumber, balance) =>
      `Transfer received: ${amount} from ${clientName} for order ${orderNumber}. New balance: ${balance}.`,
  },
  pcm: {
    dailySubject: "Your Jaylor daily digest",
    weeklySubject: "Your Jaylor weekly digest",
    transferSubject: "Jaylor: transfer don enter",
    buildDaily: (storeName, d) => {
      const lines = [`Good morning from Jaylor — ${storeName} daily digest.`];
      lines.push(
        d.due_today.length > 0
          ? `Wey dey due today (${d.due_today.length}): ${orderList(d.due_today)}`
          : "Nothing dey due today.",
      );
      if (d.due_next_3_days.length > 0) {
        lines.push(
          `Wey go due for next 3 days (${d.due_next_3_days.length}): ${orderList(d.due_next_3_days)}`,
        );
      }
      if (d.overdue.length > 0) {
        lines.push(`Overdue (${d.overdue.length}): ${orderList(d.overdue)}`);
      }
      lines.push(`Total wey remain: ${formatMoney(d.outstanding_total)}`);
      if (d.top_balances.length > 0) {
        lines.push(
          `Top balance wey you go chase: ${d.top_balances.map((b) => `${b.client_name} ${formatMoney(b.balance)}`).join(", ")}`,
        );
      }
      if (d.low_stock_items?.length > 0) {
        lines.push(
          `E dey finish: ${d.low_stock_items.map((i) => `${i.name} (${i.quantity} ${i.unit})`).join(", ")}`,
        );
      }
      return lines.join("\n");
    },
    buildWeekly: (storeName, d) => {
      const lines = [
        `${storeName} weekly digest.`,
        `New orders: ${d.new_orders} · Wey dem bill: ${formatMoney(d.billed)} · Wey dem collect: ${formatMoney(d.collected)}`,
        `Wey remain: ${formatMoney(d.outstanding_total)} · Overdue orders: ${d.overdue_count}`,
        `Garment wey go due dis week: ${d.garments_due_this_week}`,
      ];
      const firstOverloadedWeek = d.overloaded_weeks?.[0];
      if (firstOverloadedWeek) {
        lines.push(
          `Make you sabi: ${d.overloaded_weeks.length} out of di next 6 weeks don pass your normal load (e go start ${new Date(firstOverloadedWeek).toLocaleDateString()}).`,
        );
      }
      return lines.join("\n");
    },
    buildTransferAlert: (amount, clientName, orderNumber, balance) =>
      `Transfer don enter: ${amount} from ${clientName} for order ${orderNumber}. New balance: ${balance}.`,
  },
  ha: {
    dailySubject: "Taƙaitaccen bayani na yau da kullum na Jaylor",
    weeklySubject: "Taƙaitaccen bayani na mako-mako na Jaylor",
    transferSubject: "Jaylor: an karɓi canja wuri",
    buildDaily: (storeName, d) => {
      const lines = [`Ina kwana daga Jaylor — taƙaitaccen bayani na yau na ${storeName}.`];
      lines.push(
        d.due_today.length > 0
          ? `Wanda ya kamata a kai yau (${d.due_today.length}): ${orderList(d.due_today)}`
          : "Babu abin da ya kamata a kai yau.",
      );
      if (d.due_next_3_days.length > 0) {
        lines.push(
          `Zai kamata a kai cikin kwana 3 masu zuwa (${d.due_next_3_days.length}): ${orderList(d.due_next_3_days)}`,
        );
      }
      if (d.overdue.length > 0) {
        lines.push(`Ya wuce lokaci (${d.overdue.length}): ${orderList(d.overdue)}`);
      }
      lines.push(`Jimlar sauran kuɗi: ${formatMoney(d.outstanding_total)}`);
      if (d.top_balances.length > 0) {
        lines.push(
          `Manyan sauran kuɗi da za a nema: ${d.top_balances.map((b) => `${b.client_name} ${formatMoney(b.balance)}`).join(", ")}`,
        );
      }
      if (d.low_stock_items?.length > 0) {
        lines.push(
          `Yana ƙarewa: ${d.low_stock_items.map((i) => `${i.name} (${i.quantity} ${i.unit})`).join(", ")}`,
        );
      }
      return lines.join("\n");
    },
    buildWeekly: (storeName, d) => {
      const lines = [
        `Taƙaitaccen bayani na mako na ${storeName}.`,
        `Sabbin oda: ${d.new_orders} · An biya: ${formatMoney(d.billed)} · An karɓa: ${formatMoney(d.collected)}`,
        `Sauran kuɗi: ${formatMoney(d.outstanding_total)} · Odojin da suka wuce lokaci: ${d.overdue_count}`,
        `Tufafin da za a kai makon nan: ${d.garments_due_this_week}`,
      ];
      const firstOverloadedWeek = d.overloaded_weeks?.[0];
      if (firstOverloadedWeek) {
        lines.push(
          `Sanarwa: ${d.overloaded_weeks.length} daga cikin makonni 6 masu zuwa sun wuce yawan aikinka na yau da kullum (za su fara ${new Date(firstOverloadedWeek).toLocaleDateString()}).`,
        );
      }
      return lines.join("\n");
    },
    buildTransferAlert: (amount, clientName, orderNumber, balance) =>
      `An karɓi canja wuri: ${amount} daga ${clientName} don oda ${orderNumber}. Sabon sauran kuɗi: ${balance}.`,
  },
  yo: {
    dailySubject: "Ìwé ìròyìn ojoojúmọ́ rẹ láti Jaylor",
    weeklySubject: "Ìwé ìròyìn ọ̀sọ̀ọ̀sẹ̀ rẹ láti Jaylor",
    transferSubject: "Jaylor: owó ti dé",
    buildDaily: (storeName, d) => {
      const lines = [`Ẹ káàárọ̀ láti Jaylor — ìwé ìròyìn ojoojúmọ́ ti ${storeName}.`];
      lines.push(
        d.due_today.length > 0
          ? `Tí ó yẹ kí a jiṣẹ́ lónìí (${d.due_today.length}): ${orderList(d.due_today)}`
          : "Kò sí ohun tí ó yẹ kí a jiṣẹ́ lónìí.",
      );
      if (d.due_next_3_days.length > 0) {
        lines.push(
          `Tí ó yẹ kí a jiṣẹ́ láàárín ọjọ́ 3 tó ń bọ̀ (${d.due_next_3_days.length}): ${orderList(d.due_next_3_days)}`,
        );
      }
      if (d.overdue.length > 0) {
        lines.push(`Ti ré àkókò (${d.overdue.length}): ${orderList(d.overdue)}`);
      }
      lines.push(`Àpapọ̀ owó tí ó kù: ${formatMoney(d.outstanding_total)}`);
      if (d.top_balances.length > 0) {
        lines.push(
          `Àwọn gbèsè pàtàkì láti lépa: ${d.top_balances.map((b) => `${b.client_name} ${formatMoney(b.balance)}`).join(", ")}`,
        );
      }
      if (d.low_stock_items?.length > 0) {
        lines.push(
          `Ń tán: ${d.low_stock_items.map((i) => `${i.name} (${i.quantity} ${i.unit})`).join(", ")}`,
        );
      }
      return lines.join("\n");
    },
    buildWeekly: (storeName, d) => {
      const lines = [
        `Ìwé ìròyìn ọ̀sọ̀ọ̀sẹ̀ ti ${storeName}.`,
        `Àwọn ẹ̀bùn tuntun: ${d.new_orders} · Owó tí a yàn: ${formatMoney(d.billed)} · Owó tí a gbà: ${formatMoney(d.collected)}`,
        `Owó tí ó kù: ${formatMoney(d.outstanding_total)} · Ẹ̀bùn tí ó ré àkókò: ${d.overdue_count}`,
        `Aṣọ tí ó yẹ kí a jiṣẹ́ ní ọ̀sẹ̀ yìí: ${d.garments_due_this_week}`,
      ];
      const firstOverloadedWeek = d.overloaded_weeks?.[0];
      if (firstOverloadedWeek) {
        lines.push(
          `Kíyèsi: ${d.overloaded_weeks.length} nínú ọ̀sẹ̀ 6 tó ń bọ̀ ti kọjá iye iṣẹ́ rẹ déédé (yóò bẹ̀rẹ̀ ní ${new Date(firstOverloadedWeek).toLocaleDateString()}).`,
        );
      }
      return lines.join("\n");
    },
    buildTransferAlert: (amount, clientName, orderNumber, balance) =>
      `Owó ti dé: ${amount} láti ọ̀dọ̀ ${clientName} fún ẹ̀bùn ${orderNumber}. Owó tí ó kù báyìí: ${balance}.`,
  },
  ig: {
    dailySubject: "Nchịkọta kwa ụbọchị gị na Jaylor",
    weeklySubject: "Nchịkọta kwa izu gị na Jaylor",
    transferSubject: "Jaylor: anatala mbufe",
    buildDaily: (storeName, d) => {
      const lines = [`Ụtụtụ ọma site na Jaylor — nchịkọta kwa ụbọchị nke ${storeName}.`];
      lines.push(
        d.due_today.length > 0
          ? `Kwesịrị ịnye taa (${d.due_today.length}): ${orderList(d.due_today)}`
          : "Ọ dịghị ihe kwesịrị ịnye taa.",
      );
      if (d.due_next_3_days.length > 0) {
        lines.push(
          `Kwesịrị ịnye n'ime ụbọchị 3 sọ (${d.due_next_3_days.length}): ${orderList(d.due_next_3_days)}`,
        );
      }
      if (d.overdue.length > 0) {
        lines.push(`Agafeela oge (${d.overdue.length}): ${orderList(d.overdue)}`);
      }
      lines.push(`Mkpokọta ego fọdụrụ: ${formatMoney(d.outstanding_total)}`);
      if (d.top_balances.length > 0) {
        lines.push(
          `Ego fọdụrụ kacha ukwuu ị ga-achụ: ${d.top_balances.map((b) => `${b.client_name} ${formatMoney(b.balance)}`).join(", ")}`,
        );
      }
      if (d.low_stock_items?.length > 0) {
        lines.push(
          `Na-agwụ: ${d.low_stock_items.map((i) => `${i.name} (${i.quantity} ${i.unit})`).join(", ")}`,
        );
      }
      return lines.join("\n");
    },
    buildWeekly: (storeName, d) => {
      const lines = [
        `Nchịkọta kwa izu nke ${storeName}.`,
        `Iwu ọhụrụ: ${d.new_orders} · Ebipụtara: ${formatMoney(d.billed)} · Anatara: ${formatMoney(d.collected)}`,
        `Ego fọdụrụ: ${formatMoney(d.outstanding_total)} · Iwu gafere oge: ${d.overdue_count}`,
        `Uwe kwesịrị ịnye n'izu a: ${d.garments_due_this_week}`,
      ];
      const firstOverloadedWeek = d.overloaded_weeks?.[0];
      if (firstOverloadedWeek) {
        lines.push(
          `Mara nke a: ${d.overloaded_weeks.length} n'ime izu isii sọ agafeela ọrụ gị nkịtị (ga-amalite ${new Date(firstOverloadedWeek).toLocaleDateString()}).`,
        );
      }
      return lines.join("\n");
    },
    buildTransferAlert: (amount, clientName, orderNumber, balance) =>
      `Anatala mbufe: ${amount} site na ${clientName} maka iwu ${orderNumber}. Ego fọdụrụ ọhụrụ: ${balance}.`,
  },
};

export function buildDailyTextI18n(
  language: LanguageCode,
  storeName: string,
  d: DailyDigestData,
): string {
  return STRINGS[language].buildDaily(storeName, d);
}

export function buildWeeklyTextI18n(
  language: LanguageCode,
  storeName: string,
  d: WeeklyDigestData,
): string {
  return STRINGS[language].buildWeekly(storeName, d);
}

export function transferAlertTextI18n(
  language: LanguageCode,
  amount: number,
  clientName: string,
  orderNumber: string,
  balance: number,
): string {
  return STRINGS[language].buildTransferAlert(
    formatMoney(amount),
    clientName,
    orderNumber,
    formatMoney(balance),
  );
}

export function dailyDigestSubject(language: LanguageCode): string {
  return STRINGS[language].dailySubject;
}

export function weeklyDigestSubject(language: LanguageCode): string {
  return STRINGS[language].weeklySubject;
}

export function transferAlertSubject(language: LanguageCode): string {
  return STRINGS[language].transferSubject;
}
