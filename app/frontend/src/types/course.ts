import type { InstructorDashboardData } from "@/types/dashboard";

export interface InstructorCourse {
  /** Local DB id — used in routes like /instructor/courses/:localCourseId/assignments. */
  id: number;
  /** Canvas course ID — required for assignment API calls. */
  canvasCourseId?: number;
  /** Institution Canvas base URL — required for assignment API calls. */
  canvasUrl?: string;
  code: string;
  name: string;
  progress: number;
  studentCount: number;
  assignmentCount: number;
  lastActivity: string;
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
