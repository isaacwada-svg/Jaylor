import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "jaylor-pinned-nav";

function readPinned(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/** Which optional sidebar items a user has pinned, on this device. Starts
 *  empty on the server/first paint and hydrates from localStorage after
 *  mount, same pattern as useTheme. */
export function usePinnedNav() {
  const [pinned, setPinned] = useState<string[]>([]);

  useEffect(() => {
    setPinned(readPinned());
  }, []);

  const toggle = useCallback((key: string) => {
    setPinned((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage failures
      }
      return next;
    });
  }, []);

  return {
    pinned,
    isPinned: (key: string) => pinned.includes(key),
    toggle,
  };
}
