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
