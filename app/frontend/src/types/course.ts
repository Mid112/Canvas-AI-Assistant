export interface InstructorCourse {
  id: number;
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
}

export type CourseViewMode = "grid" | "list";
