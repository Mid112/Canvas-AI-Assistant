export interface AssignmentCreateCourseOption {
  id: string;
  label: string;
}

export interface AssignmentDescribeValues {
  courseId: string;
  prompt: string;
}

export interface GeneratedAssignmentDraft {
  name: string;
  description: string;
  dueDate: string;
  pointsPossible: number;
}

export type AssignmentCreateStep = "describe" | "review";

export interface AssignmentApprovePayload {
  courseId: string;
  name: string;
  description: string;
  dueDate: string;
  pointsPossible: number;
}

export interface AssignmentPreviewSummary {
  summary: string;
  reversible: boolean;
  affectedResources: { type: string; name: string }[];
}
