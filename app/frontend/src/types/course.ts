import type { InstructorDashboardData } from "@/types/dashboard";

/** Canvas course publish state from workflow_state. */
export type CourseWorkflowState = "available" | "unpublished" | "completed";

export type CoursePublishFilter = "all" | "published" | "unpublished";

export interface InstructorCourse {
  /** Local DB id — used in routes like /instructor/courses/:localCourseId/assignments. */
  id: number;
  /** Canvas course id from the sync response (display/metadata only). */
  canvasCourseId?: number;
  /** Canvas host the course was loaded from (display/metadata only). */
  canvasUrl?: string;
  code: string;
  name: string;
  progress: number;
  studentCount: number;
  assignmentCount: number;
  lastActivity: string;
  /** Canvas workflow_state: available (published), unpublished, or completed. */
  workflowState?: CourseWorkflowState | string;
}

export interface CourseAnalyticsOverview {
  averagePerformance: number;
  averagePerformanceTrend: number;
  activeStudents: number;
  totalStudents: number;
  completedAssignments: number;
  completedAssignmentsTrend: number;
  atRiskStudents: number;
  atRiskStudentsTrend: number;
}

export interface InstitutionCourseData {
  institutionId: string;
  analytics: CourseAnalyticsOverview;
  courses: InstructorCourse[];
  dashboard: InstructorDashboardData;
}

export type CourseViewMode = "grid" | "list";

/** Frontend-only active course selection persisted in local storage. */
export interface ActiveCourseSelection {
  localId: number;
  displayName: string;
}
