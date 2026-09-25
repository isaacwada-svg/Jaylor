const KEY = "jaylor:aiDesignDraft";

export type AiDesignDraft = {
  storeId: string;
  clientName: string;
  phone: string;
  description: string;
  measurements: Record<string, string>;
  /** Object path inside the private ai-design-photos bucket. */
  selfiePath: string | null;
  /** Object paths of the customer's own style reference photos, same bucket. */
  styleReferencePaths: string[];
  paymentReference?: string;
};

export function saveDesignDraft(draft: AiDesignDraft) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // ignore storage failures
  }
}

export function loadDesignDraft(): AiDesignDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AiDesignDraft) : null;
  } catch {
    return null;
  }
}

export function clearDesignDraft() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
