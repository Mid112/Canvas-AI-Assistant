import {
  getWorkflowStatusCounts,
  mockWorkflowHistory,
} from "@/data/mockWorkflowHistory";
import { formatAuditTimestamp } from "@/lib/format-audit-timestamp";
import type {
  WorkflowHistoryEntry,
  WorkflowStatusCounts,
} from "@/types/workflowHistory";
import { isWorkflowStatus } from "@/types/workflowHistory";

/**
 * Mock workflow history service backed by localStorage until the backend
 * exposes a per-user workflow history endpoint. Swap fetchWorkflowHistory()
 * to call the API and filter by the signed-in user's ID.
 */
const STORAGE_KEY = "canvas-workflow-instructor-history";
const MOCK_DELAY_MS = 350;

function delay(ms: number = MOCK_DELAY_MS): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isStoredEntry(value: unknown): value is WorkflowHistoryEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const entry = value as WorkflowHistoryEntry;

  return (
    typeof entry.id === "string" &&
    typeof entry.timestamp === "string" &&
    typeof entry.workflowName === "string" &&
    typeof entry.description === "string" &&
    typeof entry.userName === "string" &&
    isWorkflowStatus(entry.status)
  );
}

function readHistory(): WorkflowHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [...mockWorkflowHistory];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [...mockWorkflowHistory];
    }

    const valid = parsed.filter(isStoredEntry);
    if (valid.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
      return [...mockWorkflowHistory];
    }

    if (valid.length !== parsed.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
    }

    return valid;
  } catch {
    return [...mockWorkflowHistory];
  }
}

function getStoredHistory(): WorkflowHistoryEntry[] {
  const entries = readHistory();

  if (!localStorage.getItem(STORAGE_KEY)) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }

  return entries;
}

/** Resets workflow history to seed data — useful for tests. */
export function resetMockWorkflowHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export async function fetchWorkflowHistory(): Promise<WorkflowHistoryEntry[]> {
  await delay();

  // API: GET `${API_BASE_URL}/audit/logs?user_id=${currentUserId}`
  // return response.items.map(mapToWorkflowHistoryEntry);

  return getStoredHistory();
}

export function getWorkflowHistoryStatusCounts(
  entries: WorkflowHistoryEntry[],
): WorkflowStatusCounts {
  return getWorkflowStatusCounts(entries);
}

function escapeCsvField(value: string): string {
  let escaped = value;

  if (/^[=+\-@]/.test(escaped)) {
    escaped = `'${escaped}`;
  }

  if (/[",\n]/.test(escaped)) {
    return `"${escaped.replace(/"/g, '""')}"`;
  }

  return escaped;
}

export function buildWorkflowHistoryCsv(
  entries: WorkflowHistoryEntry[],
): string {
  const headers = ["Date & Time", "Workflow", "Description", "User", "Status"];

  const rows = entries.map((entry) => [
    formatAuditTimestamp(entry.timestamp),
    entry.workflowName,
    entry.description,
    entry.userName,
    entry.status,
  ]);

  return [headers, ...rows]
    .map((row) => row.map((cell) => escapeCsvField(cell)).join(","))
    .join("\n");
}

/** Triggers a browser download of workflow history entries as CSV. */
export function downloadWorkflowHistoryCsv(
  entries: WorkflowHistoryEntry[],
  filename = "workflow-history.csv",
): void {
  const csv = buildWorkflowHistoryCsv(entries);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
