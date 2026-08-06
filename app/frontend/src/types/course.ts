import type { InstructorDashboardData } from "@/types/dashboard";

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
  /** True when Canvas's workflow_state is "available" or "completed" — a
   * concluded course can still be selected/reviewed, just not written to (see
   * isWritable). "unpublished" (a draft) and "deleted" courses are non-selectable. */
  isPublished: boolean;
  /** True only when Canvas's workflow_state is "available" — controls whether
   * Canvas-content writes are offered (assignment creation, etc.), matching the
   * backend's require_writable_course check. A completed course is isPublished
   * but not isWritable: reviewable, but read-only. */
  isWritable: boolean;
  /** Canvas term name, e.g. "Fall 2026" — used only to disambiguate two
   * courses that would otherwise display an identical label (see
   * lib/disambiguate-course-labels.ts). Never shown on its own. */
  term: string | null;
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

/** Course Management's publish-status filter — "all" shows every course. */
export type CoursePublishFilter = "all" | "published" | "unpublished";

/** Frontend-only active course selection persisted in local storage. */
export interface ActiveCourseSelection {
  localId: number;
  displayName: string;
}
