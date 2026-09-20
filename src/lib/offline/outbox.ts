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
    const entries = (await dbGetAll<OutboxEntry>()).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
    for (const entry of entries) {
      try {
        await runEntry(entry);
        await dbDelete(entry.id);
        await refresh();
        window.dispatchEvent(new CustomEvent("jaylor:offline-synced", { detail: entry }));
      } catch (error) {
        if (isNetworkFailure(error)) break;
        await dbDelete(entry.id);
        await refresh();
        window.dispatchEvent(
          new CustomEvent("jaylor:offline-sync-failed", { detail: { entry, error } }),
        );
      }
    }
  } finally {
    flushing = false;
  }
}

/** Call once from the app shell. Returns a cleanup function. */
export function initOutboxSync(): () => void {
  function onOnline() {
    void flushOutbox();
  }
  window.addEventListener("online", onOnline);
  void flushOutbox();
  const interval = setInterval(() => void flushOutbox(), 30_000);
  return () => {
    window.removeEventListener("online", onOnline);
    clearInterval(interval);
  };
}
