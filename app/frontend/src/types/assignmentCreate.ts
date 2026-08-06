// Type note: documents the assignment create data contract shared by services, components, and tests.

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
  /** Null means an ungraded assignment (Ticket 21). */
  pointsPossible: number | null;
}

export type AssignmentCreateStep = "describe" | "review";

export interface AssignmentApprovePayload {
  courseId: string;
  name: string;
  description: string;
  dueDate: string;
  /** Null means create as Canvas grading_type=not_graded. */
  pointsPossible: number | null;
}

export interface AssignmentPreviewSummary {
  summary: string;
  reversible: boolean;
  affectedResources: { type: string; name: string }[];
  /** Display fields from write preview — mirrors what will be submitted. */
  title?: string;
  descriptionPreview?: string;
  dueDate?: string;
  pointsPossible?: string;
}
