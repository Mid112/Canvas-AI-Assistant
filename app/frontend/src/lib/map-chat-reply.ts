import {
  instructorCourseAnalyticsPath,
  instructorDryRunPreviewPath,
  paths,
} from "@/routes/paths";
import type { AssistantResponse } from "@/types/chat";

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

export function mapChatReplyToAssistantResponse(
  reply: Record<string, unknown>,
  isError: boolean,
): AssistantResponse {
  if (isError || reply.error) {
    return {
      content: readString(reply.error) ?? "The assistant is temporarily unavailable. Please try again.",
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
        "Review the proposed action below. Destructive or write actions require your approval before anything is sent to Canvas.",
      interpretedAction: buildInterpretedAction(proposed, previewMetadata),
    };
  }

  if (reply.action === "clarify") {
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
