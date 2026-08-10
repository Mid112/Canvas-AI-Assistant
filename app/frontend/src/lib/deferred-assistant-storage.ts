const DRAFT_PREFIX = "assistant-deferred-draft:";

export interface StoredDeferredDraft {
  message: string;
  conversationId?: number;
  deferredRequestId?: number;
  savedAt: string;
}

export function getStoredDeferredDraft(userId: number): StoredDeferredDraft | null {
  try {
    const raw = localStorage.getItem(`${DRAFT_PREFIX}${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDeferredDraft;
    if (!parsed?.message || typeof parsed.message !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setStoredDeferredDraft(
  userId: number,
  draft: Omit<StoredDeferredDraft, "savedAt">,
): void {
  localStorage.setItem(
    `${DRAFT_PREFIX}${userId}`,
    JSON.stringify({ ...draft, savedAt: new Date().toISOString() }),
  );
}

export function clearStoredDeferredDraft(userId: number): void {
  localStorage.removeItem(`${DRAFT_PREFIX}${userId}`);
}
