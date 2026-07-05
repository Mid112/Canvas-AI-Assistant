import { API_BASE_URL } from "@/config/api";
import { formatAuditTimestamp } from "@/lib/format-audit-timestamp";
import { mapWorkflowHistoryApiToEntry } from "@/lib/map-workflow-history";
import type {
  WorkflowHistoryApiResponse,
  WorkflowHistoryEntry,
  WorkflowStatusCounts,
} from "@/types/workflowHistory";
import { isWorkflowStatus } from "@/types/workflowHistory";

export const WORKFLOW_HISTORY_PATH = "/history/workflows";

class WorkflowHistoryApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "WorkflowHistoryApiError";
    this.status = status;
  }
}

async function parseError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { detail?: string };
    if (typeof data.detail === "string") {
      return data.detail;
    }
  } catch {
    // Fall through to default message.
  }

  return "Unable to load workflow history. Please try again.";
}

async function request<T>(
  path: string,
  accessToken: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Authorization", `Bearer ${accessToken}`);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new WorkflowHistoryApiError(await parseError(response), response.status);
  }

  return response.json() as Promise<T>;
}

export async function fetchWorkflowHistory(
  accessToken: string,
): Promise<WorkflowHistoryEntry[]> {
  const data = await request<WorkflowHistoryApiResponse>(
    WORKFLOW_HISTORY_PATH,
    accessToken,
  );

  return data.items.map(mapWorkflowHistoryApiToEntry);
}

export function getWorkflowHistoryStatusCounts(
  entries: WorkflowHistoryEntry[],
): WorkflowStatusCounts {
  return entries.reduce<WorkflowStatusCounts>(
    (counts, entry) => {
      if (isWorkflowStatus(entry.status)) {
        counts[entry.status] += 1;
      }
      return counts;
    },
    { approved: 0, rejected: 0, pending: 0 },
  );
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
