// Type note: documents the feedback create data contract shared by services, components, and tests.

export interface FeedbackCreateCourseOption {
  id: string;
  label: string;
}

export interface FeedbackAssignmentOption {
  id: number;
  name: string;
}

export interface FeedbackStudentOption {
  id: number;
  name: string;
}

export interface FeedbackDescribeValues {
  courseId: string;
  assignmentId: string;
  studentId: string;
  assignmentName: string;
  studentName: string;
  prompt: string;
}

export interface GeneratedFeedbackDraft {
  assignmentId: number;
  studentId: number;
  assignmentName: string;
  studentName: string;
  newGrade: string;
  feedback: string;
  currentGrade?: string | null;
}

export type FeedbackCreateStep = "describe" | "review";

export interface FeedbackApprovePayload {
  courseId: string;
  assignmentId: number;
  studentId: number;
  assignmentName: string;
  studentName: string;
  newGrade: string;
  feedback: string;
}

export interface FeedbackPreviewSummary {
  summary: string;
  reversible: boolean;
  riskLevel: "low" | "medium" | "high";
  affectedResources: { type: string; name: string }[];
}
