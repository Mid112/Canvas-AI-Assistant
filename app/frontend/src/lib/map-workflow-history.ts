import type {
  WorkflowHistoryApiItem,
  WorkflowHistoryEntry,
  WorkflowStatus,
} from "@/types/workflowHistory";

const ACTION_LABELS: Record<string, string> = {
  create_assignment: "Create Assignment",
  update_assignment: "Update Assignment",
  send_message: "Send Reminder Emails",
  fetch_courses: "Fetch Courses",
  fetch_assignments: "Fetch Assignments",
  fetch_submissions: "Fetch Submissions",
  fetch_students: "Fetch Students",
  set_active_course: "Set Active Course",
  get_active_course: "Get Active Course",
};

function formatActionName(actionName: string): string {
  if (ACTION_LABELS[actionName]) {
    return ACTION_LABELS[actionName];
  }

  return actionName
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function mapWorkflowStatus(status: string): WorkflowStatus {
  switch (status) {
    case "executed":
      return "approved";
    case "failed":
    case "cancelled":
    case "superseded":
      return "rejected";
    default:
      return "pending";
  }
}

export function mapWorkflowHistoryApiToEntry(
  item: WorkflowHistoryApiItem,
): WorkflowHistoryEntry {
  return {
    id: String(item.id),
    timestamp: item.executed_at ?? item.created_at,
    workflowName: formatActionName(item.action_name),
    description: item.user_prompt,
    userName: item.user_name,
    status: mapWorkflowStatus(item.status),
    affectedResources: item.affected_resources,
  };
}
