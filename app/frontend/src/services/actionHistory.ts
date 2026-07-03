import {
  filterActionHistory,
  mockActionHistory,
} from "@/data/mockActionHistory";
import { appendStoredActionHistory, getStoredActionHistory } from "@/lib/action-history-storage";
import type { ActionHistoryEntry } from "@/types/actionHistory";

const MOCK_DELAY_MS = 250;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function mergeActionHistory(): ActionHistoryEntry[] {
  const stored = getStoredActionHistory();
  const storedIds = new Set(stored.map((entry) => entry.id));
  const seeded = mockActionHistory.filter((entry) => !storedIds.has(entry.id));
  return [...stored, ...seeded];
}

export async function fetchActionHistory(): Promise<ActionHistoryEntry[]> {
  await delay(MOCK_DELAY_MS);
  return mergeActionHistory();
}

export async function searchActionHistory(
  search: string,
  status: string,
): Promise<ActionHistoryEntry[]> {
  const entries = await fetchActionHistory();
  return filterActionHistory(entries, search, status);
}

export async function recordActionHistoryEntry(
  entry: Omit<ActionHistoryEntry, "id">,
): Promise<ActionHistoryEntry> {
  const fullEntry: ActionHistoryEntry = {
    ...entry,
    id: `hist-${crypto.randomUUID()}`,
  };

  appendStoredActionHistory(fullEntry);
  return fullEntry;
}
