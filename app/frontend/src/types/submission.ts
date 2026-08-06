// Type note: documents the submission data contract shared by services, components, and tests.

export interface SubmissionStudent {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
  lastActive?: string;
  lateBy?: string;
}

export interface SubmissionAiSummary {
  keyInsights: string;
  recommendation: string;
  lateSubmissionsNote: string;
}

export interface AssignmentSubmissionAnalysis {
  id: string;
  courseId: number;
  label: string;
  courseCode: string;
  submissionRate: number;
  missingSubmissions: SubmissionStudent[];
  lateSubmissions: SubmissionStudent[];
  aiSummary: SubmissionAiSummary;
}

export interface InstitutionSubmissionsData {
  institutionId: string;
  assignments: AssignmentSubmissionAnalysis[];
}

export type SubmissionStatusFilter = "all" | "missing" | "late";

/** Matches GET /api/v1/canvas/courses/{id}/assignments/{id}/submissions item. */
export type ApiSubmissionStatus =
  | "graded"
  | "submitted"
  | "late"
  | "missing"
  | "unsubmitted"
  | "excused";

export interface ApiSubmission {
  id: number;
  assignment_id: number;
  user_id: number;
  student_name: string | null;
  student_email: string | null;
  student_login_id: string | null;
  submitted_at: string | null;
  workflow_state: string;
  status: ApiSubmissionStatus;
  score: number | null;
  grade: string | null;
  graded_at: string | null;
}

export type ApiSubmissionStatusFilter = "all" | ApiSubmissionStatus;
