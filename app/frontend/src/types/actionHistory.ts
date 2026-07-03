export type WorkflowExecutionStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "executed"
  | "failed";

export interface ActionHistoryEntry {
  id: string;
  originalRequest: string;
  actionType: string;
  courseLabel: string;
  status: WorkflowExecutionStatus;
  requestedAt: string;
  executedAt?: string | null;
  requestedBy: string;
}
