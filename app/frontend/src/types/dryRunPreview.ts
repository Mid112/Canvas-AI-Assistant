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
}

export type DryRunPreviewPageState =
  | "loading"
  | "available"
  | "empty"
  | "error"
  | "confirming"
  | "success";
