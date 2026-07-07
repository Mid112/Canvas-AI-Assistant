import {
  instructorChatPreviewPath,
  instructorCourseAnalyticsPath,
  instructorDryRunPreviewPath,
  paths,
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

function formatActionLabel(actionName: string): string {
  return actionName
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function buildInterpretedAction(
  proposed: Record<string, unknown> | undefined,
  previewMetadata: Record<string, unknown> | undefined,
): AssistantResponse["interpretedAction"] | undefined {
  if (!proposed) {
    return undefined;
  }

  const actionName = readString(proposed.action) ?? "Workflow";
  const courseId =
    typeof proposed.local_course_id === "number"
      ? proposed.local_course_id
      : undefined;
  const courseLabel =
    readString(previewMetadata?.course_name) ??
    readString(previewMetadata?.course) ??
    (courseId != null ? `Course ${courseId}` : "Active course");

  const recipientIds = proposed.recipient_canvas_user_ids;
  const affectedStudents = Array.isArray(recipientIds)
    ? `${recipientIds.length} students`
    : "Course-wide";

  const previewId =
    readString(proposed.preview_id) ?? readString(previewMetadata?.preview_id);

  const interpretedAction: NonNullable<AssistantResponse["interpretedAction"]> = {
    action: formatActionLabel(actionName),
    course: courseLabel,
    affectedStudents,
  };

  if (previewId) {
    interpretedAction.previewId = previewId;
    interpretedAction.primaryLink = {
      label: "Preview workflow",
      href: instructorDryRunPreviewPath(previewId),
    };
  }

  if (actionName === "send_message") {
    interpretedAction.secondaryLink = {
      label: "Open message drafts",
      href: paths.instructor.messages,
    };
  }

  if (courseId != null && actionName.includes("submission")) {
    interpretedAction.primaryLink = {
      label: "Open course analytics",
      href: instructorCourseAnalyticsPath(courseId),
    };
  }

  return interpretedAction;
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
      return `- ${String(record.name ?? record.course_code ?? record.title ?? "Course")}`;
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
  const action = readString(reply.action) ?? "action";
  const data = reply.data;

  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const label = record.name ?? record.title ?? record.id;
    if (label !== undefined) {
      return `Successfully completed ${formatActionLabel(action)}: ${String(label)}.`;
    }
  }

  return `Successfully completed ${formatActionLabel(action)}.`;
}

function buildLegacyInterpretedAction(
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

  const actionName = readString(proposedAction?.action) ?? readString(previewMetadata?.action);
  if (!actionName) {
    return undefined;
  }

  const audience = previewMetadata?.audience as
    | Record<string, unknown>
    | undefined;
  const pendingMessageId =
    typeof reply.pending_message_id === "number"
      ? reply.pending_message_id
      : undefined;

  return {
    action: formatActionLabel(actionName),
    course:
      readString(previewMetadata?.course) ??
      readString(previewMetadata?.course_name) ??
      context.activeCourseLabel ??
      "—",
    affectedStudents:
      audience?.scope === "entire_class" ? "Entire class" : "—",
    primaryLink:
      conversationId !== undefined && pendingMessageId !== undefined
        ? {
            label: "Review preview",
            href: instructorChatPreviewPath(conversationId, pendingMessageId),
          }
        : undefined,
  };
}

export function mapChatReply(
  reply: Record<string, unknown>,
  isError: boolean,
  context: AssistantContext = {},
  conversationId?: number,
): AssistantResponse {
  if (isError) {
    throw new ChatReplyMappingError(
      readString(reply.error) ??
        "The assistant is temporarily unavailable. Please try again.",
    );
  }

  if (reply.out_of_scope || reply.action === "out_of_scope") {
    return {
      content:
        readString(reply.message) ??
        "That request is outside what I can help with in Canvas.",
      safetyBlocked: true,
      safetyMessage: readString(reply.detail),
    };
  }

  if (reply.clarify || reply.action === "clarify") {
    return {
      content:
        readString(reply.question) ??
        "Could you share a bit more detail so I can help?",
    };
  }

  if (reply.intent_preview) {
    return {
      content:
        readString(reply.summary) ??
        "I prepared an action for your review. Confirm when you are ready to execute it.",
      interpretedAction: buildLegacyInterpretedAction(
        reply,
        context,
        conversationId,
      ),
      pendingMessageId:
        typeof reply.pending_message_id === "number"
          ? reply.pending_message_id
          : undefined,
    };
  }

  if (reply.cancelled) {
    return {
      content: readString(reply.message) ?? "Cancelled. No Canvas changes were made.",
    };
  }

  if (reply.action === "respond" && readString(reply.message)) {
    return { content: readString(reply.message)! };
  }

  if (readString(reply.message)) {
    return { content: readString(reply.message)! };
  }

  if (Array.isArray(reply.courses)) {
    return { content: formatCourseList(reply.courses) };
  }

  if (Array.isArray(reply.assignments)) {
    return { content: formatAssignmentList(reply.assignments) };
  }

  if (reply.success === true) {
    return { content: formatSuccessReply(reply) };
  }

  if (readString(reply.summary)) {
    return { content: readString(reply.summary)! };
  }

  return { content: JSON.stringify(reply, null, 2) };
}

export function mapChatReplyToAssistantResponse(
  reply: Record<string, unknown>,
  isError: boolean,
): AssistantResponse {
  if (isError || reply.error) {
    return {
      content:
        readString(reply.error) ??
        "The assistant is temporarily unavailable. Please try again.",
    };
  }

  if (reply.intent_preview) {
    const proposed = reply.proposed_action as Record<string, unknown> | undefined;
    const previewMetadata = reply.preview_metadata as
      | Record<string, unknown>
      | undefined;

    return {
      content:
        readString(reply.summary) ??
        "I prepared an action for your review. Confirm when you are ready to execute it.",
      explanation:
        "Review the proposed action below. Canvas write actions require your approval before anything is sent.",
      interpretedAction: buildInterpretedAction(proposed, previewMetadata),
      pendingMessageId:
        typeof reply.pending_message_id === "number"
          ? reply.pending_message_id
          : undefined,
    };
  }

  if (reply.cancelled) {
    return {
      content: readString(reply.message) ?? "Cancelled. No Canvas changes were made.",
    };
  }

  if (reply.action === "clarify" || reply.clarify) {
    return {
      content:
        readString(reply.question) ??
        "Could you share a bit more detail so I can help?",
    };
  }

  if (reply.action === "out_of_scope" || reply.out_of_scope) {
    return {
      content:
        readString(reply.message) ??
        "That request is outside what I can help with in Canvas.",
      explanation: readString(reply.detail),
      safetyBlocked: true,
      safetyMessage: readString(reply.detail),
    };
  }

  if (reply.action === "respond") {
    return {
      content: readString(reply.message) ?? "Here's what I found.",
    };
  }

  if (readString(reply.summary)) {
    return {
      content: readString(reply.summary)!,
      explanation: readString(reply.explanation),
    };
  }

  if (Array.isArray(reply.students)) {
    return {
      content:
        readString(reply.summary) ??
        `Found ${String(reply.count ?? reply.students.length)} enrolled students.`,
      explanation:
        typeof reply.active_count === "number"
          ? `${reply.active_count} students are currently active.`
          : undefined,
    };
  }

  if (Array.isArray(reply.submissions)) {
    return {
      content:
        readString(reply.summary) ?? "Here is the latest submission summary.",
      explanation: readString(reply.summary),
    };
  }

  if (Array.isArray(reply.courses)) {
    return {
      content: `You have ${reply.courses.length} connected courses.`,
    };
  }

  if (Array.isArray(reply.assignments)) {
    return {
      content: `This course has ${reply.assignments.length} assignments.`,
    };
  }

  if (reply.active_course) {
    const activeCourse = reply.active_course as Record<string, unknown>;
    return {
      content: `Active course: ${readString(activeCourse.name) ?? "selected course"}.`,
    };
  }

  if (reply.data) {
    return {
      content: "The action completed successfully.",
      explanation: JSON.stringify(reply.data, null, 2),
    };
  }

  return {
    content: "I processed your request.",
    explanation: JSON.stringify(reply, null, 2),
  };
}
