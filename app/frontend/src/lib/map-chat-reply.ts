import {
  formatDueDateForDisplay,
  formatDueDateForInput,
} from "@/lib/assignment-utils";
import {
  instructorChatPreviewPath,
  instructorCourseAnalyticsPath,
  instructorDryRunPreviewPath,
  instructorMessagesPath,
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

const INTERNAL_FIELDS = new Set([
  "action",
  "local_course_id",
  "assignment_id",
  "student_id",
  "recipient_canvas_user_ids",
  "recipient_handle",
  "preview_id",
]);

function formatFieldLabel(field: string): string {
  return field
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatSafeValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `${value.length} item${value.length === 1 ? "" : "s"}`;
  }
  return undefined;
}

function readableFields(
  value: unknown,
): Array<{ label: string; value: string }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  return Object.entries(value as Record<string, unknown>)
    .filter(([field]) => !INTERNAL_FIELDS.has(field))
    .flatMap(([field, fieldValue]) => {
      const formatted = formatSafeValue(fieldValue);
      return formatted
        ? [{ label: formatFieldLabel(field), value: formatted }]
        : [];
    });
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
    technicalDetails: [
      { label: "Action type", value: formatActionLabel(actionName) },
      ...(readString(previewMetadata?.risk_level)
        ? [{ label: "Risk level", value: readString(previewMetadata?.risk_level)! }]
        : []),
      ...(typeof previewMetadata?.reversible === "boolean"
        ? [
            {
              label: "Reversible",
              value: previewMetadata.reversible ? "Yes" : "No",
            },
          ]
        : []),
      ...(actionName === "create_quiz"
        ? [
            {
              label: "Quiz engine",
              value:
                proposed.quiz_engine === "new_quizzes"
                  ? "New Quizzes"
                  : "Classic Quizzes",
            },
          ]
        : []),
    ],
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
    const subject = readString(proposed.subject);
    const body = readString(proposed.body);
    const recipientIds = Array.isArray(proposed.recipient_canvas_user_ids)
      ? proposed.recipient_canvas_user_ids
          .map((id) => String(id))
          .filter((id) => id.length > 0)
      : undefined;

    interpretedAction.secondaryLink = {
      label: "Edit in message draft",
      href: instructorMessagesPath({ tab: "compose" }),
      state: {
        returnTo: paths.instructor.assistant,
        aiMessageDraft: {
          subject,
          body,
          prompt: readString(previewMetadata?.summary),
          courseId,
          recipientIds,
        },
      },
    };
  }

  if (actionName === "create_quiz") {
    const questions = Array.isArray(proposed.questions)
      ? proposed.questions.map((question) => {
          const record = question as Record<string, unknown>;
          return {
            questionText: readString(record.question_text) ?? "",
            questionType:
              readString(record.question_type) ?? "essay_question",
            pointsPossible:
              typeof record.points_possible === "number"
                ? record.points_possible
                : 1,
            answers: Array.isArray(record.answers)
              ? record.answers
              : [],
          };
        })
      : [];
    interpretedAction.secondaryLink = {
      label: "Edit quiz details",
      href: paths.instructor.quizCreate,
      state: {
        returnTo: paths.instructor.assistant,
        aiQuizDraft: {
          courseId,
          name: readString(proposed.title),
          description: readString(proposed.description),
          dueDate: readString(proposed.due_date)
            ? formatDueDateForInput(readString(proposed.due_date)!)
            : undefined,
          pointsPossible: proposed.points_possible,
          allowedAttempts: proposed.allowed_attempts,
          timeLimit: proposed.time_limit,
          quizEngine:
            proposed.quiz_engine === "new_quizzes"
              ? "new_quizzes"
              : "classic",
          questionBankGroups: Array.isArray(proposed.question_bank_groups)
            ? proposed.question_bank_groups.map((group) => {
                const record = group as Record<string, unknown>;
                return {
                  bankId: Number(record.bank_id),
                  bankName: readString(record.bank_name) ?? "Question bank",
                  pickCount: Number(record.pick_count),
                  questionPoints: Number(record.question_points),
                };
              })
            : [],
          questions,
        },
      },
    };
  }

  if (actionName === "create_assignment") {
    interpretedAction.secondaryLink = {
      label: "Edit assignment details",
      href: paths.instructor.assignmentCreate,
      state: {
        returnTo: paths.instructor.assistant,
        aiAssignmentDraft: {
          courseId,
          name: readString(proposed.title),
          description: readString(proposed.description),
          dueDate: readString(proposed.due_date)
            ? formatDueDateForInput(readString(proposed.due_date)!)
            : undefined,
          pointsPossible: proposed.points_possible,
        },
      },
    };
  }

  if (actionName === "update_grade") {
    interpretedAction.secondaryLink = {
      label: "Edit feedback details",
      href: paths.instructor.feedbackCreate,
      state: {
        returnTo: paths.instructor.assistant,
        aiFeedbackDraft: {
          courseId,
          assignmentId:
            typeof proposed.assignment_id === "number"
              ? proposed.assignment_id
              : undefined,
          studentId:
            typeof proposed.student_id === "number"
              ? proposed.student_id
              : undefined,
          assignmentName: readString(proposed.assignment_reference) ?? undefined,
          studentName: readString(proposed.student_reference) ?? undefined,
          newGrade: readString(proposed.new_grade) ?? undefined,
          feedback: readString(proposed.feedback) ?? undefined,
        },
      },
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
    const acknowledgedFields = readableFields(reply.partial_plan);
    const acknowledgement =
      acknowledgedFields.length > 0
        ? `I have ${acknowledgedFields
            .map((field) => `${field.label.toLowerCase()}: ${field.value}`)
            .join(", ")}. `
        : "";
    const question =
      readString(reply.question) ??
      "Could you share a bit more detail so I can help?";
    return {
      content: `${acknowledgement}${question}`,
      acknowledgedFields,
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
    };
  }

  if (readString(reply.message)) {
    return { content: readString(reply.message)! };
  }

  return {
    content:
      "I completed the request, but no additional details were returned.",
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
