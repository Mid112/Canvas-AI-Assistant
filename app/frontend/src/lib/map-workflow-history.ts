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

function summarizeResourceValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  return null;
}

function summarizeAffectedResource(resource: Record<string, unknown>): string {
  const label =
    summarizeResourceValue(resource.title) ??
    summarizeResourceValue(resource.name) ??
    summarizeResourceValue(resource.resource_name) ??
    summarizeResourceValue(resource.resource_id) ??
    summarizeResourceValue(resource.id) ??
    "Resource";

  const type =
    summarizeResourceValue(resource.type) ??
    summarizeResourceValue(resource.resource_type);

  return type ? `${type}: ${label}` : label;
}

function summarizeAffectedResources(
  resources: Array<Record<string, unknown>>,
): string {
  if (resources.length === 0) {
    return "None recorded";
  }

  return resources.map(summarizeAffectedResource).join("; ");
}

export function mapWorkflowHistoryApiToEntry(
  item: WorkflowHistoryApiItem,
): WorkflowHistoryEntry {
  const affectedResources = item.affected_resources;

  return {
    id: String(item.id),
    timestamp: item.executed_at ?? item.created_at,
    actionName: item.action_name,
    workflowName: formatActionName(item.action_name),
    prompt: item.user_prompt,
    userName: item.user_name,
    status: mapWorkflowStatus(item.status),
    affectedResources,
    affectedResourcesSummary: summarizeAffectedResources(affectedResources),
  };
}
