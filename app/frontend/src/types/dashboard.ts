export interface DashboardMetrics {
  activeCourses: number;
  activeCoursesTrend: number;
  totalStudents: number;
  totalStudentsTrend: number;
  missingSubmissions: number;
  missingSubmissionsTrend: number;
  pendingApprovals: number;
}

export type DashboardActivityType =
  | "assignment_created"
  | "grades_updated"
  | "announcement_posted"
  | "message_received";

export interface DashboardActivity {
  id: string;
  type: DashboardActivityType;
  title: string;
  courseLabel: string;
  timestamp: string;
}

export interface DashboardQuickAction {
  id: string;
  title: string;
  description: string;
}

export interface DashboardActiveCourse {
  id: number;
  code: string;
  name: string;
  studentCount: number;
  assignmentCount: number;
}

export type DashboardNotificationVariant = "warning" | "success" | "info";

export interface DashboardNotification {
  id: string;
  message: string;
  timestamp: string;
  variant: DashboardNotificationVariant;
}

export interface InstructorDashboardData {
  metrics: DashboardMetrics;
  recentActivity: DashboardActivity[];
  quickActions: DashboardQuickAction[];
  activeCourses: DashboardActiveCourse[];
  notifications: DashboardNotification[];
}

export const sharedDashboardQuickActions: DashboardQuickAction[] = [
  {
    id: "create-assignment",
    title: "Create Assignment",
    description: "AI-assisted assignment creation",
  },
  {
    id: "create-quiz",
    title: "Create Quiz",
    description: "AI-assisted quiz creation",
  },
  {
    id: "create-feedback",
    title: "Draft Feedback",
    description: "AI-assisted submission feedback",
  },
  {
    id: "draft-announcement",
    title: "Draft Announcement",
    description: "Generate course announcement",
  },
  {
    id: "grade-analysis",
    title: "Analyse Missing Submissions",
    description: "See who hasn't submitted",
  },
];
