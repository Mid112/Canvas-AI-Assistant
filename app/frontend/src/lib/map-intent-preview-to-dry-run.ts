import type { ConversationMessage } from "@/services/assistant";
import type {
  DryRunActionType,
  DryRunAffectedResources,
  DryRunApiOperation,
  DryRunPreviewData,
  ReversibilityLevel,
} from "@/types/dryRunPreview";

interface IntentPreviewPayload {
  summary?: string;
  proposed_action?: Record<string, unknown>;
  preview_metadata?: Record<string, unknown>;
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
    };
  } catch {
    return null;
  }
}

function mapActionType(actionName: string): DryRunActionType {
  switch (actionName) {
    case "create_assignment":
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

function mapApiOperations(actionName: string): DryRunApiOperation[] {
  switch (actionName) {
    case "create_assignment":
      return [{ method: "POST", endpoint: "/courses/:course_id/assignments" }];
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

function findOriginalRequest(
  messages: ConversationMessage[],
  previewMessageId: number,
): string {
  const previewIndex = messages.findIndex((message) => message.id === previewMessageId);
  if (previewIndex <= 0) {
    return "Assistant action preview";
  }

  for (let index = previewIndex - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "user" && !message.content.startsWith("[")) {
      return message.content;
    }
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

  return {
    id: `chat-${conversationId}-${pendingMessageId}`,
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
    apiOperations: mapApiOperations(actionName),
    affectedResources: mapAffectedResources(previewMetadata),
    reversibility,
    reversibilityExplanation: explanation,
  };
}
