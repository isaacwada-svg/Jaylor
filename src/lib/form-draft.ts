const DRAFT_VERSION = 1;

/**
 * Best-effort localStorage draft persistence for in-progress multi-step
 * forms (e.g. New order). Storage can be unavailable (private browsing,
 * quota) or the payload can be malformed after a schema change -- either
 * way a draft is a convenience, never a requirement, so every op swallows
 * its own errors.
 */
export function saveDraft<T extends object>(key: string, data: T) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({ ...data, savedAt: Date.now(), version: DRAFT_VERSION }),
    );
  } catch {
    // ignore
  }
}

export function loadDraft<T>(key: string): (T & { savedAt: number }) | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || parsed.version !== DRAFT_VERSION) return null;
    return parsed as T & { savedAt: number };
  } catch {
    return null;
  }
}

export function clearDraft(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
