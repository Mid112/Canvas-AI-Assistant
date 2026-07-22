import { mapWorkflowHistoryApiToEntry } from "@/lib/map-workflow-history";
import type {
  InstructorDashboardData,
  DashboardActivityType,
  DashboardNotificationVariant,
} from "@/types/dashboard";
import { sharedDashboardQuickActions } from "@/types/dashboard";

export interface InstructorDashboardApiResponse {
  course_count: number;
  student_count: number;
  assignment_count: number;
  missing_submissions: number;
  late_submissions: number;
  pending_workflows: number;
  active_course: {
    local_id: number;
    name: string;
    canvas_course_id: number;
  } | null;
  courses: Array<{
    local_id: number;
    name: string;
    student_count: number;
    assignment_count: number;
    missing_submissions: number;
    late_submissions: number;
  }>;
  recent_workflows: Array<{
    id: number;
    action_name: string;
    user_prompt: string;
    status: string;
    created_at: string;
  }>;
}

function mapWorkflowToActivityType(actionName: string): DashboardActivityType {
  switch (actionName) {
    case "create_assignment":
    case "create_quiz":
    case "update_assignment":
      return "assignment_created";
    case "send_message":
      return "announcement_posted";
    default:
      return "message_received";
  }
}

function formatActionLabel(actionName: string): string {
  return actionName
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function mapInstructorDashboardApiToData(
  response: InstructorDashboardApiResponse,
): InstructorDashboardData {
  const notifications: InstructorDashboardData["notifications"] = [];

  if (response.missing_submissions > 0) {
    notifications.push({
      id: "missing-submissions",
      message: `${response.missing_submissions} missing submissions need attention`,
      timestamp: new Date().toISOString(),
      variant: "warning" satisfies DashboardNotificationVariant,
    });
  }

  if (response.late_submissions > 0) {
    notifications.push({
      id: "late-submissions",
      message: `${response.late_submissions} late submissions detected`,
      timestamp: new Date().toISOString(),
      variant: "warning" satisfies DashboardNotificationVariant,
    });
  }

  if (response.pending_workflows > 0) {
    notifications.push({
      id: "pending-workflows",
      message: `${response.pending_workflows} workflows awaiting approval`,
      timestamp: new Date().toISOString(),
      variant: "info" satisfies DashboardNotificationVariant,
    });
  }

  const courseLabel = response.active_course?.name ?? "Your courses";

  return {
    metrics: {
      activeCourses: response.course_count,
      activeCoursesTrend: 0,
      totalStudents: response.student_count,
      totalStudentsTrend: 0,
      missingSubmissions: response.missing_submissions,
      missingSubmissionsTrend: 0,
      pendingApprovals: response.pending_workflows,
    },
    recentActivity: response.recent_workflows.map((workflow) => ({
      id: String(workflow.id),
      type: mapWorkflowToActivityType(workflow.action_name),
      title: formatActionLabel(workflow.action_name),
      courseLabel,
      timestamp: workflow.created_at,
    })),
    quickActions: sharedDashboardQuickActions,
    activeCourses: response.courses.map((course) => ({
      id: course.local_id,
      code: course.name.includes(":") ? course.name.split(":")[0]!.trim() : course.name,
      name: course.name,
      studentCount: course.student_count,
      assignmentCount: course.assignment_count,
    })),
    notifications,
  };
}

export function mapRecentWorkflowsToActivity(
  response: InstructorDashboardApiResponse,
): InstructorDashboardData["recentActivity"] {
  return mapInstructorDashboardApiToData(response).recentActivity;
}

export { mapWorkflowHistoryApiToEntry };
