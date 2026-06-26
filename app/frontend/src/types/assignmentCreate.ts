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
