// Type note: documents the workflow history data contract shared by services, components, and tests.

export type WorkflowStatus = "approved" | "rejected" | "pending" | "paused";

export interface WorkflowHistoryEntry {
  id: string;
  timestamp: string;
  actionName: string;
  workflowName: string;
  prompt: string;
  userName: string;
  status: WorkflowStatus;
  affectedResources: Array<Record<string, unknown>>;
  affectedResourcesSummary: string;
  /** Whether this action *type* has a working undo path at all — still
   * needs status === "approved" (i.e. backend "executed") and no undoneAt
   * before actually showing an Undo affordance. */
  undoable: boolean;
  undoneAt: string | null;
  reversal?: ReversalMetadata;
}

export interface ReversalMetadata {
  status: "available" | "unavailable" | "reversed" | string;
  available: boolean;
  optionLabel: string | null;
  warning: string | null;
  unavailableReason: string | null;
  recoveryInstructions: string;
  resultMessage: string | null;
  reversedAt: string | null;
}

/**
 * Backend workflows row shape returned by GET /history/workflows.
 * Aligns with app/backend/app/schemas/history.py and models/workflow.py.
 */
export interface WorkflowHistoryApiItem {
  id: number;
  conversation_id: number | null;
  action_name: string;
  user_prompt: string;
  status: string;
  proposed_action: Record<string, unknown>;
  affected_resources: Array<Record<string, unknown>>;
  created_at: string;
  executed_at: string | null;
  user_name: string;
  undoable?: boolean;
  undone_at?: string | null;
  reversal?: {
    status: string;
    available: boolean;
    option_label: string | null;
    warning: string | null;
    unavailable_reason: string | null;
    recovery_instructions: string;
    result_message: string | null;
    reversed_at: string | null;
  };
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
  paused: number;
}

export const WORKFLOW_HISTORY_PAGE_SIZE = 10;

export function isWorkflowStatus(value: unknown): value is WorkflowStatus {
  return (
    value === "approved" ||
    value === "rejected" ||
    value === "pending" ||
    value === "paused"
  );
}

export function hasActiveWorkflowHistoryFilters(
  filters: WorkflowHistoryFilters,
): boolean {
  return Boolean(filters.search || filters.status);
}
