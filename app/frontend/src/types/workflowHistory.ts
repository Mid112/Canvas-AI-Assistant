export type WorkflowStatus = "approved" | "rejected" | "pending";

export interface WorkflowHistoryEntry {
  id: string;
  timestamp: string;
  workflowName: string;
  description: string;
  userName: string;
  status: WorkflowStatus;
}

/**
 * Backend workflows row shape (+ joined audit_log fields).
 * Aligns with app/backend/app/models/workflow.py and db/init/01_schema.sql.
 *
 * workflows.status is CHECK-constrained to 'pending' | 'approved' | 'rejected'.
 * The action/details live in the related audit_logs row (via workflow_id FK).
 */
export interface WorkflowHistoryApiRecord {
  id: number;
  user_id: number;
  conversation_id: number;
  intent: string;
  status: WorkflowStatus;
  created_at: string;
  generated_query: Record<string, unknown> | null;
  preview_data: Record<string, unknown> | null;
  user_name: string;
  audit_action: string | null;
  audit_details: Record<string, unknown> | null;
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
