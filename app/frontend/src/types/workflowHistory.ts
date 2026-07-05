export type WorkflowStatus = "approved" | "rejected" | "pending";

export interface WorkflowHistoryEntry {
  id: string;
  timestamp: string;
  workflowName: string;
  description: string;
  userName: string;
  status: WorkflowStatus;
  affectedResources: Array<Record<string, unknown>>;
}

/**
 * Backend workflows row shape returned by GET /history/workflows.
 * Aligns with app/backend/app/schemas/history.py and models/workflow.py.
 */
export interface WorkflowHistoryApiItem {
  id: number;
  conversation_id: number;
  action_name: string;
  user_prompt: string;
  status: string;
  proposed_action: Record<string, unknown>;
  affected_resources: Array<Record<string, unknown>>;
  created_at: string;
  executed_at: string | null;
  user_name: string;
}

export interface WorkflowHistoryApiResponse {
  items: WorkflowHistoryApiItem[];
  total: number;
}

export interface WorkflowHistoryFilters {
  search: string;
  status: "" | WorkflowStatus;
}

export const emptyWorkflowHistoryFilters: WorkflowHistoryFilters = {
  search: "",
  status: "",
};

export interface WorkflowStatusCounts {
  approved: number;
  rejected: number;
  pending: number;
}

export const WORKFLOW_HISTORY_PAGE_SIZE = 10;

export function isWorkflowStatus(value: unknown): value is WorkflowStatus {
  return value === "approved" || value === "rejected" || value === "pending";
}

export function hasActiveWorkflowHistoryFilters(
  filters: WorkflowHistoryFilters,
): boolean {
  return Boolean(filters.search || filters.status);
}
