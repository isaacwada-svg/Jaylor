import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { dbDelete, dbGetAll, dbPut } from "./db";

export type OutboxKind = "client.create" | "order.create" | "payment.create" | "measurement.create";

export type OutboxEntry = {
  id: string;
  kind: OutboxKind;
  storeId: string;
  label: string;
  payload: unknown;
  createdAt: string;
  /** Set when a plan-limit rejection (see isOrderLimitRejection) parked this entry
   *  instead of discarding it. Blocked entries are skipped by flushOutbox() until
   *  unblocked -- see unblockEntry(). */
  blockedByLimit?: boolean;
  /** Africa/Lagos 'YYYY-MM' at the moment this entry was blocked -- a later month
   *  means the plan's monthly allowance has reset, so it's worth retrying. */
  blockedMonth?: string;
};

type Listener = (entries: OutboxEntry[]) => void;
const listeners = new Set<Listener>();
let cache: OutboxEntry[] = [];

async function refresh() {
  cache = await dbGetAll<OutboxEntry>();
  listeners.forEach((l) => l(cache));
}

export function subscribeOutbox(listener: Listener): () => void {
  listeners.add(listener);
  listener(cache);
  void refresh();
  return () => {
    listeners.delete(listener);
  };
}

export function usePendingOutbox(storeId?: string): OutboxEntry[] {
  const [entries, setEntries] = useState<OutboxEntry[]>(cache);
  useEffect(() => subscribeOutbox(setEntries), []);
  return storeId ? entries.filter((e) => e.storeId === storeId) : entries;
}

export async function enqueue(entry: Omit<OutboxEntry, "id" | "createdAt">): Promise<OutboxEntry> {
  const full: OutboxEntry = {
    ...entry,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  await dbPut(full);
  await refresh();
  return full;
}

/** True when a failure looks like "no connection" rather than a real server rejection. */
export function isNetworkFailure(error: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  return error instanceof TypeError;
}

/** Custom SQLSTATE the enforce_order_limit() trigger raises -- see its migration. */
const ORDER_LIMIT_ERROR_CODE = "P0100";

/** True when a queued order was rejected by the plan's monthly order limit, not a real error. */
function isOrderLimitRejection(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === ORDER_LIMIT_ERROR_CODE
  );
}

/** Africa/Lagos 'YYYY-MM', matching enforce_order_limit()'s `to_char(now() AT TIME ZONE
 *  'Africa/Lagos', 'YYYY-MM')` -- so a locally-computed month rollover agrees with the
 *  server's. */
function currentLagosMonth(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  return `${year}-${month}`;
}

/** Clears the blocked flags so the next flush attempts this entry again. */
async function unblockEntry(entry: OutboxEntry): Promise<void> {
  const { blockedByLimit: _blockedByLimit, blockedMonth: _blockedMonth, ...rest } = entry;
  await dbPut(rest);
  await refresh();
}

async function runEntry(entry: OutboxEntry): Promise<void> {
  switch (entry.kind) {
    case "client.create": {
      const { error } = await supabase.from("clients").insert(entry.payload as never);
      if (error) throw error;
      return;
    }
    case "order.create": {
      const { order, material } = entry.payload as {
        order: Record<string, unknown>;
        material: Record<string, unknown>;
      };
      const { data, error } = await supabase
        .from("orders")
        .insert(order as never)
        .select()
        .single();
      if (error) throw error;
      const { error: materialError } = await supabase
        .from("order_materials")
        .insert({ ...material, order_id: data.id } as never);
      if (materialError) throw materialError;
      return;
    }
    case "payment.create": {
      const { error } = await supabase.from("payments").insert(entry.payload as never);
      if (error) throw error;
      return;
    }
    case "measurement.create": {
      const { error } = await supabase.from("measurement_sets").insert(entry.payload as never);
      if (error) throw error;
      return;
    }
  }
}

let flushing = false;

export async function flushOutbox(): Promise<void> {
  if (flushing || (typeof navigator !== "undefined" && !navigator.onLine)) return;
  flushing = true;
  try {
    // A new Africa/Lagos month means the plan's monthly order allowance has
    // reset -- give any limit-blocked entries another try instead of
    // leaving them parked forever.
    const nowMonth = currentLagosMonth();
    for (const entry of await dbGetAll<OutboxEntry>()) {
      if (entry.blockedByLimit && entry.blockedMonth !== nowMonth) {
        await unblockEntry(entry);
      }
    }

    const entries = (await dbGetAll<OutboxEntry>()).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
    for (const entry of entries) {
      // Skip without attempting -- retrying a plan-limit rejection every 30s
      // would just fail again and again until the plan changes or the month
      // rolls over (both handled above / via jaylor:plan-changed).
      if (entry.blockedByLimit) continue;
      try {
        await runEntry(entry);
        await dbDelete(entry.id);
        await refresh();
        window.dispatchEvent(new CustomEvent("jaylor:offline-synced", { detail: entry }));
      } catch (error) {
        if (isNetworkFailure(error)) break;
        if (isOrderLimitRejection(error)) {
          // Not a real error to discard -- park it instead of losing the
          // client's order, but stop hammering the server with it.
          await dbPut({ ...entry, blockedByLimit: true, blockedMonth: nowMonth });
          await refresh();
          window.dispatchEvent(
            new CustomEvent("jaylor:offline-blocked-by-limit", { detail: entry }),
          );
        } else {
          await dbDelete(entry.id);
          await refresh();
          window.dispatchEvent(
            new CustomEvent("jaylor:offline-sync-failed", { detail: { entry, error } }),
          );
        }
      }
    }
  } finally {
    flushing = false;
  }
}

/** After a plan change (upgrade, downgrade, or switching to Free), retry anything the old
 *  plan's limit had blocked -- see billing.tsx, where this event is dispatched. */
function onPlanChanged() {
  void (async () => {
    for (const entry of await dbGetAll<OutboxEntry>()) {
      if (entry.blockedByLimit) await unblockEntry(entry);
    }
    void flushOutbox();
  })();
}

/** Call once from the app shell. Returns a cleanup function. */
export function initOutboxSync(): () => void {
  function onOnline() {
    void flushOutbox();
  }
  window.addEventListener("online", onOnline);
  window.addEventListener("jaylor:plan-changed", onPlanChanged);
  void flushOutbox();
  const interval = setInterval(() => void flushOutbox(), 30_000);
  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("jaylor:plan-changed", onPlanChanged);
    clearInterval(interval);
  };
}
