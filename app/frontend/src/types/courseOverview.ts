export type CourseAssignmentStatus = "active" | "upcoming" | "completed";

export interface RecentAssignmentSummary {
  localId: number;
  title: string;
  dueDate: string | null;
  submittedCount: number;
  totalStudents: number;
  status: CourseAssignmentStatus;
}

export interface StudentActivityItem {
  studentName: string;
  action: string;
  occurredAt: string;
}

export interface CourseOverviewData {
  localId: number;
  canvasCourseId: string;
  name: string;
  term: string | null;
  isActive: boolean;
  studentCount: number;
  assignmentCount: number;
  missingSubmissions: number;
  lateSubmissions: number;
  averageGrade: number | null;
  completionRate: number | null;
  recentAssignments: RecentAssignmentSummary[];
  recentActivity: StudentActivityItem[];
}
