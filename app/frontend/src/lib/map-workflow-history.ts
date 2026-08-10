import type {
  WorkflowHistoryApiItem,
  WorkflowHistoryEntry,
  WorkflowStatus,
} from "@/types/workflowHistory";

const ACTION_LABELS: Record<string, string> = {
  create_assignment: "Create Assignment",
  create_quiz: "Create Quiz",
  update_assignment: "Update Assignment",
  send_message: "Send Reminder Emails",
  fetch_courses: "Fetch Courses",
  fetch_assignments: "Fetch Assignments",
  fetch_quizzes: "Fetch Quizzes",
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
    case "paused":
      return "paused";
    case "pending":
    case "executing":
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
  const undoable = item.undoable ?? false;
  const undoneAt = item.undone_at ?? null;
  const fallbackReversal = {
    status: undoneAt ? "reversed" : undoable ? "available" : "unavailable",
    available: undoable && !undoneAt && item.status === "executed",
    optionLabel: undoable ? "Reverse action" : null,
    warning: undoable ? "Review this reversal before applying it in Canvas." : null,
    unavailableReason: undoable ? null : "This workflow does not support automated reversal.",
    recoveryInstructions: undoable
      ? "Use the reversal option while this workflow remains available."
      : "Apply any needed correction manually in Canvas.",
    resultMessage: undoneAt ? "This workflow was reversed." : null,
    reversedAt: undoneAt,
  };
  const apiReversal = item.reversal;

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
    undoable,
    undoneAt,
    reversal: apiReversal
      ? {
          status: apiReversal.status,
          available: apiReversal.available,
          optionLabel: apiReversal.option_label,
          warning: apiReversal.warning,
          unavailableReason: apiReversal.unavailable_reason,
          recoveryInstructions: apiReversal.recovery_instructions,
          resultMessage: apiReversal.result_message,
          reversedAt: apiReversal.reversed_at,
        }
      : fallbackReversal,
  };
}
