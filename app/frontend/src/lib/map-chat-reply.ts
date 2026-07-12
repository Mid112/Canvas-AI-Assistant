import { formatDueDateForDisplay } from "@/lib/assignment-utils";
import {
  instructorChatPreviewPath,
  instructorCourseAnalyticsPath,
  instructorDryRunPreviewPath,
  paths,
} from "@/routes/paths";
import type { AssistantResponse } from "@/types/chat";

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
  conversationId?: number,
  pendingMessageId?: number,
): AssistantResponse["interpretedAction"] | undefined {
  if (!proposed) {
    return undefined;
  }

  const actionName = readString(proposed.action) ?? "Workflow";
  const courseId =
    typeof proposed.local_course_id === "number"
      ? proposed.local_course_id
      : undefined;
  // Never fall back to showing courseId itself — it's the internal local DB
  // row id, not anything the instructor recognizes as a course identifier.
  const courseLabel =
    readString(previewMetadata?.course_name) ??
    readString(previewMetadata?.course) ??
    "Active course";

  const audience = previewMetadata?.audience as
    | Record<string, unknown>
    | undefined;
  const recipientIds = proposed.recipient_canvas_user_ids;
  const affectedStudents =
    audience?.scope === "entire_class"
      ? "Entire class"
      : Array.isArray(recipientIds)
        ? `${recipientIds.length} students`
        : "Course-wide";

  const previewId =
    readString(proposed.preview_id) ?? readString(previewMetadata?.preview_id);

  const interpretedAction: NonNullable<AssistantResponse["interpretedAction"]> = {
    action: formatActionLabel(actionName),
    course: courseLabel,
    affectedStudents,
  };

  if (conversationId !== undefined && pendingMessageId !== undefined) {
    interpretedAction.primaryLink = {
      label: "Review preview",
      href: instructorChatPreviewPath(conversationId, pendingMessageId),
    };
  } else if (previewId) {
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

export function mapChatReplyToAssistantResponse(
  reply: Record<string, unknown>,
  isError: boolean,
  conversationId?: number,
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
    const pendingMessageId =
      typeof reply.pending_message_id === "number"
        ? reply.pending_message_id
        : undefined;

    // A grouped send_message turn can resolve to more than one distinct
    // message (see additional_previews in chat.py's
    // _persist_additional_message_previews) — each entry is shaped
    // identically to this same reply, so it maps the same way.
    const additionalPreviewsRaw = Array.isArray(reply.additional_previews)
      ? (reply.additional_previews as Record<string, unknown>[])
      : undefined;
    const additionalPreviews = additionalPreviewsRaw?.map((entry) =>
      mapChatReplyToAssistantResponse(entry, false, conversationId),
    );

    return {
      content:
        readString(reply.summary) ??
        "I prepared an action for your review. Confirm when you are ready to execute it.",
      explanation:
        "Review the proposed action below. Destructive or write actions require your approval before anything is sent to Canvas.",
      interpretedAction: buildInterpretedAction(
        proposed,
        previewMetadata,
        conversationId,
        pendingMessageId,
      ),
      pendingMessageId,
      additionalPreviews,
    };
  }

  if (reply.cancelled) {
    return {
      content:
        readString(reply.message) ?? "Cancelled — no changes were made.",
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

  if (reply.success === true) {
    const action = readString(reply.action) ?? "action";
    const data = reply.data;
    if (data && typeof data === "object") {
      const record = data as Record<string, unknown>;
      const label = readString(record.name) ?? readString(record.title);
      if (label) {
        return {
          content: `Successfully completed ${formatActionLabel(action)}: ${label}.`,
        };
      }
    }

    return {
      content: `Successfully completed ${formatActionLabel(action)}.`,
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
    if (reply.courses.length === 0) {
      return { content: "You have no connected courses." };
    }

    const list = reply.courses
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

    return { content: list };
  }

  if (Array.isArray(reply.assignments)) {
    if (reply.assignments.length === 0) {
      return { content: "This course has no assignments yet." };
    }

    const list = reply.assignments
      .map((assignment) => {
        if (!assignment || typeof assignment !== "object") {
          return "- Assignment";
        }

        const record = assignment as Record<string, unknown>;
        const name = readString(record.name) ?? "Untitled assignment";
        const dueDate = formatDueDateForDisplay(
          readString(record.due_at as string | undefined) ?? null,
        );
        const points =
          typeof record.points_possible === "number"
            ? `${record.points_possible} pts`
            : undefined;

        const details = [dueDate, points].filter(Boolean).join(" · ");
        return `- ${name} (${details})`;
      })
      .join("\n");

    return { content: list };
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

  if (readString(reply.message)) {
    return { content: readString(reply.message)! };
  }

  return {
    content: "I processed your request.",
    explanation: JSON.stringify(reply, null, 2),
  };
}

/** @deprecated Use mapChatReplyToAssistantResponse */
export function mapChatReply(
  reply: Record<string, unknown>,
  isError: boolean,
  conversationId?: number,
): AssistantResponse {
  if (isError) {
    const errorMessage =
      readString(reply.error) ??
      "The assistant is temporarily unavailable. Please try again.";
    throw new ChatReplyMappingError(errorMessage);
  }

  return mapChatReplyToAssistantResponse(reply, false, conversationId);
}
