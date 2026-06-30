export interface Assignment {
  id: number;
  name: string;
  description: string | null;
  due_at: string | null;
  points_possible: number | null;
  course_id: number;
}

export interface AssignmentCreatePayload {
  name: string;
  description: string | null;
  due_at: string | null;
}

export interface AssignmentUpdatePayload {
  name: string;
  description: string | null;
  due_at: string | null;
}

export interface AssignmentFormValues {
  name: string;
  description: string;
  dueDate: string;
}

export interface AssignmentFieldChange {
  field: "title" | "description" | "dueDate";
  label: string;
  original: string;
  updated: string;
}
