import { apiRequest, ApiRequestError } from "@/lib/api-request";
import { formatAuditTimestamp } from "@/lib/format-audit-timestamp";
import { mapWorkflowHistoryApiToEntry } from "@/lib/map-workflow-history";
import type {
  WorkflowHistoryApiItem,
  WorkflowHistoryApiResponse,
  WorkflowHistoryEntry,
  WorkflowStatusCounts,
} from "@/types/workflowHistory";
import { isWorkflowStatus } from "@/types/workflowHistory";

export const WORKFLOW_HISTORY_PATH = "/history/workflows";
const WORKFLOW_HISTORY_PAGE_SIZE = 200;

export interface WorkflowHistoryResult {
  entries: WorkflowHistoryEntry[];
  total: number;
}

export class WorkflowHistoryApiError extends ApiRequestError {
  constructor(message: string, status: number) {
    super(message, status);
    this.name = "WorkflowHistoryApiError";
  }
}

export async function fetchWorkflowHistory(
  accessToken: string,
): Promise<WorkflowHistoryResult> {
  try {
    const items = [];
    let total = 0;
    let offset = 0;

    while (true) {
      const data = await apiRequest<WorkflowHistoryApiResponse>(
        `${WORKFLOW_HISTORY_PATH}?limit=${WORKFLOW_HISTORY_PAGE_SIZE}&offset=${offset}`,
        accessToken,
      );

      total = data.total;
      items.push(...data.items);

      if (items.length >= total || data.items.length === 0) {
        break;
      }

      offset += WORKFLOW_HISTORY_PAGE_SIZE;
    }

    return {
      entries: items.map(mapWorkflowHistoryApiToEntry),
      total,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to load workflow history. Please try again.";

    const status = error instanceof ApiRequestError ? error.status : 0;
    throw new WorkflowHistoryApiError(message, status);
  }
}

/** Cancels a pending workflow via the backend cancel endpoint. */
export async function cancelWorkflow(
  accessToken: string,
  workflowId: string,
): Promise<WorkflowHistoryEntry> {
  try {
    const data = await apiRequest<WorkflowHistoryApiItem>(
      `${WORKFLOW_HISTORY_PATH}/${workflowId}/cancel`,
      accessToken,
      { method: "POST" },
    );
    return mapWorkflowHistoryApiToEntry(data);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to cancel this workflow.";
    const status = error instanceof ApiRequestError ? error.status : 0;
    throw new WorkflowHistoryApiError(message, status);
  }
}

export async function undoWorkflow(
  accessToken: string,
  workflowId: string,
): Promise<WorkflowHistoryEntry> {
  try {
    const item = await apiRequest<WorkflowHistoryApiItem>(
      `${WORKFLOW_HISTORY_PATH}/${workflowId}/undo`,
      accessToken,
      { method: "POST" },
    );
    return mapWorkflowHistoryApiToEntry(item);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to reverse this action. Please try again.";

    const status = error instanceof ApiRequestError ? error.status : 0;
    throw new WorkflowHistoryApiError(message, status);
  }
}

export async function reverseWorkflow(
  accessToken: string,
  workflowId: string,
): Promise<WorkflowHistoryEntry> {
  try {
    const item = await apiRequest<WorkflowHistoryApiItem>(
      `${WORKFLOW_HISTORY_PATH}/${workflowId}/reverse`,
      accessToken,
      { method: "POST" },
    );
    return mapWorkflowHistoryApiToEntry(item);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to undo this action. Please try again.";

    const status = error instanceof ApiRequestError ? error.status : 0;
    throw new WorkflowHistoryApiError(message, status);
  }
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
  const headers = [
    "Date & Time",
    "Action",
    "Prompt",
    "User",
    "Status",
    "Affected Resources",
  ];

  const rows = entries.map((entry) => [
    formatAuditTimestamp(entry.timestamp),
    entry.workflowName,
    entry.prompt,
    entry.userName,
    entry.status,
    entry.affectedResourcesSummary,
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
