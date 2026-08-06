// Frontend helper note: centralizes map intent preview to dry run behavior so components and tests share one implementation.

import type { ConversationMessage } from "@/services/assistant";
import type {
  DryRunActionType,
  DryRunAffectedResources,
  DryRunApiOperation,
  DryRunPreviewData,
  FieldChange,
  PlanField,
  ReversibilityLevel,
} from "@/types/dryRunPreview";

interface IntentPreviewPayload {
  summary?: string;
  proposed_action?: Record<string, unknown>;
  preview_metadata?: Record<string, unknown>;
  previous_proposed_action?: Record<string, unknown>;
}

// Not meaningful to surface as a "change": the action type switching would
// be a different preview entirely, and local_course_id is an internal id
// the user never typed.
const DIFF_IGNORED_FIELDS = new Set([
  "action",
  "local_course_id",
  "assignment_id",
  "student_id",
  "recipient_canvas_user_ids",
  "recipient_handle",
]);

function formatFieldLabel(field: string): string {
  return field
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `${value.length} item${value.length === 1 ? "" : "s"}`;
  }
  return "";
}

function computeProposedActionChanges(
  previous: Record<string, unknown> | undefined,
  current: Record<string, unknown> | undefined,
): FieldChange[] {
  if (!previous || !current) {
    return [];
  }

  const fields = new Set([...Object.keys(previous), ...Object.keys(current)]);
  const changes: FieldChange[] = [];

  for (const field of fields) {
    if (DIFF_IGNORED_FIELDS.has(field)) {
      continue;
    }

    const hasPrevious = Object.hasOwn(previous, field);
    const hasCurrent = Object.hasOwn(current, field);
    const label = formatFieldLabel(field);

    if (hasPrevious && !hasCurrent) {
      changes.push({ field, label, type: "removed", from: formatFieldValue(previous[field]) });
    } else if (!hasPrevious && hasCurrent) {
      changes.push({ field, label, type: "added", to: formatFieldValue(current[field]) });
    } else if (JSON.stringify(previous[field]) !== JSON.stringify(current[field])) {
      changes.push({
        field,
        label,
        type: "changed",
        from: formatFieldValue(previous[field]),
        to: formatFieldValue(current[field]),
      });
    }
  }

  return changes;
}

// Fields users care about seeing first; anything else in proposed_action
// still shows up, just after these, in whatever order it was given.
const PLAN_FIELD_ORDER = ["title", "subject", "description", "body", "due_date", "points_possible"];

function buildProposedPlanFields(
  proposed: Record<string, unknown> | undefined,
): PlanField[] {
  if (!proposed) {
    return [];
  }

  const fields = Object.keys(proposed).filter((field) => !DIFF_IGNORED_FIELDS.has(field));
  fields.sort((a, b) => {
    const indexA = PLAN_FIELD_ORDER.indexOf(a);
    const indexB = PLAN_FIELD_ORDER.indexOf(b);
    if (indexA === -1 && indexB === -1) {
      return 0;
    }
    if (indexA === -1) {
      return 1;
    }
    if (indexB === -1) {
      return -1;
    }
    return indexA - indexB;
  });

  const actionName = String(proposed.action ?? "");
  const editableByAction: Record<string, Set<string>> = {
    create_assignment: new Set([
      "title",
      "description",
      "due_date",
      "points_possible",
    ]),
    create_quiz: new Set([
      "title",
      "description",
      "due_date",
      "points_possible",
      "allowed_attempts",
      "time_limit",
      "quiz_engine",
      "questions",
      "question_bank_groups",
    ]),
    update_assignment: new Set([
      "title",
      "description",
      "due_date",
      "points_possible",
    ]),
    send_message: new Set(["subject", "body"]),
    update_grade: new Set(["new_grade", "feedback"]),
  };
  const editable = editableByAction[actionName] ?? new Set<string>();

  return fields.map((field) => ({
    field,
    label: formatFieldLabel(field),
    value: formatFieldValue(proposed[field]) || "—",
    rawValue: proposed[field],
    editable: editable.has(field),
  }));
}

function parseIntentPreviewContent(content: string): IntentPreviewPayload | null {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (!parsed.intent_preview) {
      return null;
    }

    return {
      summary: typeof parsed.summary === "string" ? parsed.summary : undefined,
      proposed_action:
        parsed.proposed_action && typeof parsed.proposed_action === "object"
          ? (parsed.proposed_action as Record<string, unknown>)
          : undefined,
      preview_metadata:
        parsed.preview_metadata && typeof parsed.preview_metadata === "object"
          ? (parsed.preview_metadata as Record<string, unknown>)
          : undefined,
      previous_proposed_action:
        parsed.previous_proposed_action && typeof parsed.previous_proposed_action === "object"
          ? (parsed.previous_proposed_action as Record<string, unknown>)
          : undefined,
    };
  } catch {
    return null;
  }
}

function mapActionType(actionName: string): DryRunActionType {
  switch (actionName) {
    case "create_assignment":
    case "create_quiz":
      return "Create";
    case "update_assignment":
    case "update_grade":
      return "Update";
    case "send_message":
      return "Send Message";
    default:
      return "Read Only";
  }
}

function mapReversibility(
  previewMetadata: Record<string, unknown>,
): {
  reversibility: ReversibilityLevel;
  explanation: string;
} {
  if (previewMetadata.reversible === false) {
    return {
      reversibility: "irreversible",
      explanation:
        typeof previewMetadata.reversibility_note === "string"
          ? previewMetadata.reversibility_note
          : "This action cannot be undone once submitted.",
    };
  }

  if (previewMetadata.reversible === true) {
    return {
      reversibility: "partially-reversible",
      explanation:
        "Some parts of this action may be reversible, but side effects such as notifications cannot be undone automatically.",
    };
  }

  return {
    reversibility: "partially-reversible",
    explanation:
      "Review the proposed action carefully before confirming execution.",
  };
}

function mapApiOperations(
  actionName: string,
  proposed?: Record<string, unknown>,
): DryRunApiOperation[] {
  switch (actionName) {
    case "create_assignment":
      return [{ method: "POST", endpoint: "/courses/:course_id/assignments" }];
    case "create_quiz":
      if (proposed?.quiz_engine === "new_quizzes") {
        return [
          { method: "POST", endpoint: "/api/quiz/v1/courses/:course_id/quizzes" },
          {
            method: "POST",
            endpoint:
              "/api/quiz/v1/courses/:course_id/quizzes/:assignment_id/items",
          },
        ];
      }
      return [
        { method: "POST", endpoint: "/courses/:course_id/quizzes" },
        { method: "POST", endpoint: "/courses/:course_id/quizzes/:id/questions" },
        ...(Array.isArray(proposed?.question_bank_groups) &&
        proposed.question_bank_groups.length > 0
          ? [
              {
                method: "POST" as const,
                endpoint: "/courses/:course_id/quizzes/:id/groups",
              },
            ]
          : []),
      ];
    case "update_assignment":
      return [
        { method: "GET", endpoint: "/courses/:course_id/assignments/:id" },
        { method: "PUT", endpoint: "/courses/:course_id/assignments/:id" },
      ];
    case "send_message":
      return [{ method: "POST", endpoint: "/courses/:course_id/discussion_topics" }];
    case "update_grade":
      return [
        { method: "PUT", endpoint: "/courses/:course_id/assignments/:id/submissions/:user_id" },
      ];
    default:
      return [{ method: "GET", endpoint: "/courses/:course_id" }];
  }
}

function mapAffectedResources(
  previewMetadata: Record<string, unknown>,
): DryRunAffectedResources {
  const resources = Array.isArray(previewMetadata.affected_resources)
    ? previewMetadata.affected_resources
    : [];

  const affected: DryRunAffectedResources = {};

  for (const resource of resources) {
    if (!resource || typeof resource !== "object") {
      continue;
    }

    const record = resource as Record<string, unknown>;
    const type = String(record.type ?? "");
    const name = record.name != null ? String(record.name) : undefined;
    const id = record.id != null ? String(record.id) : undefined;

    if (type === "course" && name) {
      affected.course = { name, id: id ?? "course" };
      continue;
    }

    if (type === "assignment") {
      const metadata = previewMetadata.metadata as
        | Record<string, unknown>
        | undefined;
      affected.assignment = {
        name: name ?? "Assignment",
        id: id ?? "assignment",
        dueDate:
          typeof metadata?.due_date === "string" ? metadata.due_date : undefined,
      };
    }

    if (type === "quiz") {
      const metadata = previewMetadata.metadata as
        | Record<string, unknown>
        | undefined;
      affected.assignment = {
        name: name ?? "Quiz",
        id: id ?? "quiz",
        dueDate:
          typeof metadata?.due_date === "string" ? metadata.due_date : undefined,
      };
    }
  }

  const audience = previewMetadata.audience as Record<string, unknown> | undefined;
  if (audience?.scope === "entire_class") {
    affected.students = { count: typeof audience.size === "number" ? audience.size : 0 };
  }

  return affected;
}

function buildAiExplanation(
  actionName: string,
  previewMetadata: Record<string, unknown>,
): string[] {
  const metadata = previewMetadata.metadata as Record<string, unknown> | undefined;
  const summary =
    typeof previewMetadata.summary === "string"
      ? previewMetadata.summary
      : undefined;

  if (summary) {
    return [summary];
  }

  switch (actionName) {
    case "create_assignment":
      return [
        `Create assignment "${String(metadata?.title ?? "Untitled")}" in ${String(previewMetadata.course ?? "the selected course")}.`,
      ];
    case "create_quiz":
      return [
        `Create quiz "${String(metadata?.title ?? "Untitled Quiz")}" in ${String(previewMetadata.course ?? "the selected course")}.`,
      ];
    case "update_assignment":
      return [
        `Update assignment ${String(metadata?.assignment_id ?? "")} in ${String(previewMetadata.course ?? "the selected course")}.`,
      ];
    case "send_message":
      return [
        `Post "${String(metadata?.subject ?? "Announcement")}" to ${String(previewMetadata.course ?? "the selected course")}.`,
      ];
    default:
      return [`Execute ${actionName.replaceAll("_", " ")}.`];
  }
}

function isClarifyMessage(content: string): boolean {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return parsed.action === "clarify" || parsed.clarify === true;
  } catch {
    return false;
  }
}

function findOriginalRequest(
  messages: ConversationMessage[],
  previewMessageId: number,
): string {
  const previewIndex = messages.findIndex((message) => message.id === previewMessageId);
  if (previewIndex === -1) {
    return "Assistant action preview";
  }

  // A "modify" round overwrites this preview's own message row in place
  // (see update_message_content in chat.py) rather than inserting a new
  // one, so the request that produced the *current* content of this
  // preview is logged AFTER this row, not before. Prefer the latest user
  // message following this preview, stopping at a confirm/cancel marker
  // since that closes out this chain — anything past it belongs to a
  // different, later exchange.
  let latestModifyRequest: string | undefined;
  for (let index = previewIndex + 1; index < messages.length; index += 1) {
    const message = messages[index];
    if (message.role !== "user") {
      continue;
    }
    if (message.content.startsWith("[")) {
      break;
    }
    latestModifyRequest = message.content;
  }
  if (latestModifyRequest !== undefined) {
    return latestModifyRequest;
  }

  // No modify round happened — walk backward for the request that started
  // this chain. A short reply like "55" to a clarifying question is not
  // that request on its own: if the message immediately before a
  // candidate is a clarify prompt, the candidate is just an answer to it,
  // so keep walking past both to find the real originating message.
  for (let index = previewIndex - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "user" || message.content.startsWith("[")) {
      continue;
    }

    const precedingMessage = index > 0 ? messages[index - 1] : undefined;
    const isClarifyAnswer =
      precedingMessage?.role === "assistant" && isClarifyMessage(precedingMessage.content);

    if (!isClarifyAnswer) {
      return message.content;
    }

    // Skip past the clarify question too — its answer isn't a fresh
    // candidate, and the next iteration should look further back.
    index -= 1;
  }

  return "Assistant action preview";
}

export function mapIntentPreviewToDryRun(
  conversationId: number,
  pendingMessageId: number,
  messages: ConversationMessage[],
  requestedBy: string,
): DryRunPreviewData {
  const previewMessage = messages.find((message) => message.id === pendingMessageId);

  if (!previewMessage) {
    throw new Error("Preview message not found in this conversation.");
  }

  const payload = parseIntentPreviewContent(previewMessage.content);
  if (!payload) {
    throw new Error("This message does not contain a workflow preview.");
  }

  const actionName = String(
    payload.proposed_action?.action ?? payload.preview_metadata?.action ?? "unknown",
  );
  const previewMetadata = payload.preview_metadata ?? {};
  const { reversibility, explanation } = mapReversibility(previewMetadata);
  const riskLevel =
    previewMetadata.risk_level === "low" ||
    previewMetadata.risk_level === "medium" ||
    previewMetadata.risk_level === "high"
      ? previewMetadata.risk_level
      : undefined;

  return {
    id: `chat-${conversationId}-${pendingMessageId}`,
    actionName,
    title: "Workflow Preview",
    subtitle: "Review AI-generated actions before execution",
    originalRequest: findOriginalRequest(messages, pendingMessageId),
    requestedBy,
    requestedAt: previewMessage.created_at,
    summary:
      payload.summary ??
      (typeof previewMetadata.summary === "string"
        ? previewMetadata.summary
        : "Review the proposed action before confirming."),
    actionType: mapActionType(actionName),
    aiExplanation: buildAiExplanation(actionName, previewMetadata),
    apiOperations: mapApiOperations(actionName, payload.proposed_action),
    affectedResources: mapAffectedResources(previewMetadata),
    reversibility,
    reversibilityExplanation: explanation,
    riskLevel,
    changesFromPreviousRequest: computeProposedActionChanges(
      payload.previous_proposed_action,
      payload.proposed_action,
    ),
    proposedPlan: buildProposedPlanFields(payload.proposed_action),
  };
}
