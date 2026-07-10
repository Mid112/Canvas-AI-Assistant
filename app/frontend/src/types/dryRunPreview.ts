export type DryRunActionType =
  | "Read Only"
  | "Create"
  | "Update"
  | "Delete"
  | "Send Message";

export type ReversibilityLevel = "reversible" | "partially-reversible" | "irreversible";

export type DryRunHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface DryRunApiOperation {
  method: DryRunHttpMethod;
  endpoint: string;
}

export interface DryRunStudent {
  id: string;
  name: string;
  email: string;
}

export interface DryRunCourseResource {
  name: string;
  id: string;
}

export interface DryRunAssignmentResource {
  name: string;
  id: string;
  dueDate?: string;
}

export interface DryRunAffectedResources {
  course?: DryRunCourseResource;
  assignment?: DryRunAssignmentResource;
  students?: DryRunStudent[] | { count: number };
  sections?: { count: number };
}

export type FieldChangeType = "added" | "removed" | "changed";

export interface FieldChange {
  field: string;
  label: string;
  type: FieldChangeType;
  from?: string;
  to?: string;
}

export interface PlanField {
  field: string;
  label: string;
  value: string;
}

export interface DryRunPreviewData {
  id: string;
  title: string;
  subtitle: string;
  originalRequest: string;
  requestedBy: string;
  requestedAt: string;
  summary: string;
  actionType: DryRunActionType;
  aiExplanation: string[];
  aiExplanationNote?: string;
  apiOperations: DryRunApiOperation[];
  affectedResources: DryRunAffectedResources;
  reversibility: ReversibilityLevel;
  reversibilityExplanation: string;
  /** Field-level diff against the immediately preceding modify round, if
   * this preview was revised at least once. Only one step of history is
   * kept — see previous_proposed_action in chat.py. */
  changesFromPreviousRequest?: FieldChange[];
  /** The current proposed_action's fields, i.e. what will actually be
   * sent to Canvas if this is confirmed. Preferred over originalRequest
   * (free text) for display: reconstructing "what the user asked for"
   * from conversation history breaks down across clarify/modify chains
   * in ways structured data doesn't. Undefined for previews without a
   * structured proposed_action (e.g. the mock dry-run flow). */
  proposedPlan?: PlanField[];
}

export type DryRunPreviewPageState =
  | "loading"
  | "available"
  | "empty"
  | "error"
  | "confirming"
  | "success";
