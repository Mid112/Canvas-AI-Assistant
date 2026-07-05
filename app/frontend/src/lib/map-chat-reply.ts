import {
  instructorChatPreviewPath,
} from "@/routes/paths";
import type {
  AssistantContext,
  AssistantResponse,
  InterpretedAction,
} from "@/types/chat";

export class ChatReplyMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatReplyMappingError";
  }
}

function humanizeAction(actionName: string): string {
  return actionName
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function mapIntentPreview(
  reply: Record<string, unknown>,
  context: AssistantContext,
  conversationId?: number,
): InterpretedAction | undefined {
  const previewMetadata = reply.preview_metadata as
    | Record<string, unknown>
    | undefined;
  const proposedAction = reply.proposed_action as
    | Record<string, unknown>
    | undefined;

  const actionName = String(
    proposedAction?.action ?? previewMetadata?.action ?? "",
  );
  if (!actionName) {
    return undefined;
  }

  const course = String(
    previewMetadata?.course ?? context.activeCourseLabel ?? "—",
  );

  const audience = previewMetadata?.audience as
    | Record<string, unknown>
    | undefined;
  const affectedStudents =
    audience?.scope === "entire_class" ? "Entire class" : "—";

  const pendingMessageId =
    typeof reply.pending_message_id === "number"
      ? reply.pending_message_id
      : undefined;

  const primaryLink =
    conversationId !== undefined && pendingMessageId !== undefined
      ? {
          label: "Review preview",
          href: instructorChatPreviewPath(conversationId, pendingMessageId),
        }
      : undefined;

  return {
    action: humanizeAction(actionName),
    course,
    affectedStudents,
    primaryLink,
  };
}

function formatCourseList(courses: unknown[]): string {
  if (courses.length === 0) {
    return "You have no connected courses.";
  }

  return courses
    .map((course) => {
      if (!course || typeof course !== "object") {
        return "- Course";
      }

      const record = course as Record<string, unknown>;
      const label =
        record.name ?? record.course_code ?? record.title ?? "Course";
      return `- ${String(label)}`;
    })
    .join("\n");
}

function formatAssignmentList(assignments: unknown[]): string {
  if (assignments.length === 0) {
    return "No assignments found for this course.";
  }

  return assignments
    .map((assignment) => {
      if (!assignment || typeof assignment !== "object") {
        return "- Assignment";
      }

      const record = assignment as Record<string, unknown>;
      return `- ${String(record.name ?? record.title ?? "Assignment")}`;
    })
    .join("\n");
}

function formatSuccessReply(reply: Record<string, unknown>): string {
  const action = typeof reply.action === "string" ? reply.action : "action";
  const data = reply.data;

  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const label = record.name ?? record.title ?? record.id;
    if (label !== undefined) {
      return `Successfully completed ${humanizeAction(action)}: ${String(label)}.`;
    }
  }

  return `Successfully completed ${humanizeAction(action)}.`;
}

function formatStructuredReply(reply: Record<string, unknown>): string {
  if (Array.isArray(reply.courses)) {
    return formatCourseList(reply.courses);
  }

  if (Array.isArray(reply.assignments)) {
    return formatAssignmentList(reply.assignments);
  }

  if (typeof reply.summary === "string") {
    return reply.summary;
  }

  return JSON.stringify(reply, null, 2);
}

export function mapChatReply(
  reply: Record<string, unknown>,
  isError: boolean,
  context: AssistantContext = {},
  conversationId?: number,
): AssistantResponse {
  if (isError) {
    const errorMessage =
      typeof reply.error === "string"
        ? reply.error
        : "The assistant is temporarily unavailable. Please try again.";
    throw new ChatReplyMappingError(errorMessage);
  }

  if (reply.out_of_scope) {
    return {
      content: String(reply.message ?? "Your request is out of scope."),
      safetyBlocked: true,
      safetyMessage:
        typeof reply.detail === "string" ? reply.detail : undefined,
    };
  }

  if (reply.clarify) {
    return {
      content: String(reply.question ?? "I need more information."),
    };
  }

  if (reply.intent_preview) {
    return {
      content: String(reply.summary ?? "Here is what I propose to do."),
      interpretedAction: mapIntentPreview(reply, context, conversationId),
      pendingMessageId:
        typeof reply.pending_message_id === "number"
          ? reply.pending_message_id
          : undefined,
    };
  }

  if (reply.cancelled) {
    return {
      content: String(
        reply.message ?? "Cancelled — no changes were made.",
      ),
    };
  }

  if (reply.action === "respond" && typeof reply.message === "string") {
    return { content: reply.message };
  }

  if (typeof reply.message === "string") {
    return { content: reply.message };
  }

  if (reply.success === true) {
    return { content: formatSuccessReply(reply) };
  }

  return { content: formatStructuredReply(reply) };
}
