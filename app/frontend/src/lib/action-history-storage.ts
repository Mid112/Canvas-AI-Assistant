import type { ActionHistoryEntry } from "@/types/actionHistory";

const STORAGE_KEY = "cwf_action_history";

export function getStoredActionHistory(): ActionHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as ActionHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function appendStoredActionHistory(entry: ActionHistoryEntry): void {
  const current = getStoredActionHistory();
  localStorage.setItem(STORAGE_KEY, JSON.stringify([entry, ...current]));
}
