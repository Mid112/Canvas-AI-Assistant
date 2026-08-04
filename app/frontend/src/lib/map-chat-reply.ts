import {
  formatDueDateForDisplay,
  formatDueDateForInput,
} from "@/lib/assignment-utils";
import {
  instructorChatPreviewPath,
  instructorCourseAnalyticsPath,
  instructorCourseGradesPrefillPath,
  instructorDryRunPreviewPath,
  instructorMessagesPath,
  instructorSettingsPath,
  paths,
} from "@/routes/paths";
import type { AssistantResponse, RiskMetadata } from "@/types/chat";

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

function readNumberArray(value: unknown): number[] | undefined {
  // Backend JSON can arrive from persisted transcripts too, so tolerate
  // numeric strings while still dropping malformed ids before building links.
  if (!Array.isArray(value)) {
    return undefined;
  }

  const numbers = value
    .map((entry) => (typeof entry === "number" ? entry : Number(entry)))
    .filter((entry) => Number.isFinite(entry));
  return numbers.length > 0 ? numbers : undefined;
}

function readNumber(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function buildGradeHandoffAction(
  handoff: Record<string, unknown> | undefined,
): AssistantResponse["interpretedAction"] | undefined {
  // update_grade no longer renders as a chat approval card. The resolver still
  // does the hard work, but the action card opens the dedicated Grades tab so
  // instructors see the same preview, warnings, and typed approval every time.
  if (!handoff) {
    return undefined;
  }

  const courseId =
    typeof handoff.local_course_id === "number"
      ? handoff.local_course_id
      : undefined;
  const assignmentId =
    typeof handoff.assignment_id === "number" ? handoff.assignment_id : undefined;
  if (courseId === undefined || assignmentId === undefined) {
    // A half-shaped handoff is safer as plain assistant text than as a broken
    // navigation button to the wrong course or assignment.
    return undefined;
  }

  const studentIds = readNumberArray(handoff.student_ids);
  return {
    action: "Update Grade",
    course: readString(handoff.course_name) ?? "Active course",
    affectedStudents:
      typeof handoff.student_count === "number"
        ? `${handoff.student_count} student${handoff.student_count === 1 ? "" : "s"}`
        : studentIds
          ? `${studentIds.length} student${studentIds.length === 1 ? "" : "s"}`
          : "Selected students",
    primaryLink: {
      label: "Open Grades tab",
      href: instructorCourseGradesPrefillPath(courseId, {
        assignmentId,
        studentIds,
        grade: readString(handoff.new_grade),
        reason: readString(handoff.reason),
      }),
    },
  };
}

function buildGradeClarifyHandoffAction(
  partialPlan: Record<string, unknown> | undefined,
): AssistantResponse["interpretedAction"] | undefined {
  if (!partialPlan || partialPlan.action !== "update_grade") {
    return undefined;
  }

  const courseId = readNumber(partialPlan.local_course_id);
  if (courseId === undefined) {
    return undefined;
  }

  const hasGradeManagementSignal =
    readString(partialPlan.new_grade) !== undefined ||
    readNumber(partialPlan.assignment_id) !== undefined ||
    readString(partialPlan.assignment_reference) !== undefined ||
    readString(partialPlan.submission_reference) !== undefined;

  if (!hasGradeManagementSignal) {
    // "Feedback" alone can mean assignment feedback or a private message.
    // Keep those turns as clarify text until the user picks the surface.
    return undefined;
  }

  const studentId = readNumber(partialPlan.student_id);
  const studentIds =
    readNumberArray(partialPlan.student_ids) ??
    (studentId !== undefined ? [studentId] : undefined);

  return {
    action: "Update Grade",
    course: readString(partialPlan.course_name) ?? "Active course",
    affectedStudents: studentIds
      ? `${studentIds.length} student${studentIds.length === 1 ? "" : "s"}`
      : "Course-wide",
    primaryLink: {
      label: "Open Grades tab",
      href: instructorCourseGradesPrefillPath(courseId, {
        assignmentId: readNumber(partialPlan.assignment_id),
        studentIds,
        grade: readString(partialPlan.new_grade),
        reason: readString(partialPlan.reason),
      }),
    },
  };
}

function buildInterpretedAction(
  proposed: Record<string, unknown> | undefined,
  previewMetadata: Record<string, unknown> | undefined,
  conversationId?: number,
  pendingMessageId?: number,
  timeZone?: string,
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
    risk: readRiskMetadata(previewMetadata?.risk_metadata),
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
            ? formatDueDateForInput(readString(proposed.due_date)!, timeZone)
            : undefined,
          pointsPossible: readNumber(proposed.points_possible) ?? null,
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

function readRiskMetadata(value: unknown): RiskMetadata | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as Partial<RiskMetadata>;
  if (
    (record.risk_level === "low" ||
      record.risk_level === "medium" ||
      record.risk_level === "high") &&
    record.confirmation_requirement &&
    typeof record.confirmation_requirement === "object"
  ) {
    return record as RiskMetadata;
  }
  return undefined;
}

function buildQuizCreateDraftState(
  proposed: Record<string, unknown>,
  conversationId?: number,
  timeZone?: string,
): Record<string, unknown> {
  const questions = Array.isArray(proposed.questions)
    ? proposed.questions.map((question) => {
        const record = question as Record<string, unknown>;
        return {
          questionText: readString(record.question_text) ?? "",
          questionType:
            (readString(record.question_type) as
              | "multiple_choice_question"
              | "true_false_question"
              | "short_answer_question"
              | "essay_question") ?? "essay_question",
          pointsPossible:
            typeof record.points_possible === "number"
              ? record.points_possible
              : 1,
          answers: Array.isArray(record.answers)
            ? (record.answers as Array<{ text: string; weight: number }>)
            : [],
        };
      })
    : [];

  return {
    returnTo: paths.instructor.assistant,
    aiQuizDraft: {
      courseId:
        typeof proposed.local_course_id === "number"
          ? proposed.local_course_id
          : undefined,
      name: readString(proposed.title),
      description: readString(proposed.description),
      dueDate: readString(proposed.due_date)
        ? formatDueDateForInput(readString(proposed.due_date)!, timeZone)
        : undefined,
      pointsPossible: proposed.points_possible,
      allowedAttempts: proposed.allowed_attempts,
      timeLimit: proposed.time_limit,
      quizEngine:
        proposed.quiz_engine === "new_quizzes" ? "new_quizzes" : "classic",
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
      conversationId,
    },
  };
}

function buildQuizCreateNavigateTo(
  proposed: Record<string, unknown>,
  conversationId?: number,
  timeZone?: string,
): NonNullable<AssistantResponse["navigateTo"]> {
  return {
    path: paths.instructor.quizCreate,
    state: buildQuizCreateDraftState(proposed, conversationId, timeZone),
  };
}

function buildMessageDraftState(
  proposed: Record<string, unknown>,
  previewMetadata: Record<string, unknown> | undefined,
  conversationId?: number,
): Record<string, unknown> {
  const recipientIds = Array.isArray(proposed.recipient_canvas_user_ids)
    ? proposed.recipient_canvas_user_ids
        .map((id) => String(id))
        .filter((id) => id.length > 0)
    : undefined;

  return {
    returnTo: paths.instructor.assistant,
    aiMessageDraft: {
      subject: readString(proposed.subject),
      body: readString(proposed.body),
      prompt: readString(previewMetadata?.summary),
      courseId:
        typeof proposed.local_course_id === "number"
          ? proposed.local_course_id
          : undefined,
      recipientIds,
      conversationId,
    },
  };
}

function buildMessageDraftFormAction(
  proposed: Record<string, unknown>,
  previewMetadata: Record<string, unknown> | undefined,
  conversationId?: number,
): NonNullable<AssistantResponse["interpretedAction"]> {
  const courseLabel =
    readString(previewMetadata?.course_name) ??
    readString(previewMetadata?.course) ??
    "Active course";
  const draftState = buildMessageDraftState(
    proposed,
    previewMetadata,
    conversationId,
  );

  return {
    action: "Send Message",
    course: courseLabel,
    affectedStudents: Array.isArray(proposed.recipient_canvas_user_ids)
      ? `${proposed.recipient_canvas_user_ids.length} students`
      : "Course-wide",
    technicalDetails: [
      { label: "Action type", value: "Send Message" },
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
    ],
    primaryLink: {
      label: "Open message draft",
      href: instructorMessagesPath({ tab: "compose" }),
      state: draftState,
    },
  };
}

function buildFeedbackDraftNavigateTo(
  proposed: Record<string, unknown>,
  conversationId?: number,
): NonNullable<AssistantResponse["navigateTo"]> {
  const assignmentName =
    readString(proposed.assignment_reference) ?? "Assignment";
  const studentName = readString(proposed.student_reference) ?? "Student";

  return {
    path: paths.instructor.feedbackCreate,
    state: {
      returnTo: paths.instructor.assistant,
      aiFeedbackDraft: {
        courseId:
          typeof proposed.local_course_id === "number"
            ? proposed.local_course_id
            : undefined,
        assignmentId:
          typeof proposed.assignment_id === "number"
            ? proposed.assignment_id
            : undefined,
        studentId:
          typeof proposed.student_id === "number"
            ? proposed.student_id
            : undefined,
        assignmentName,
        studentName,
        newGrade: readString(proposed.new_grade),
        feedback: readString(proposed.feedback),
        conversationId,
      },
    },
  };
}

function buildQuizCreateFormAction(
  proposed: Record<string, unknown>,
  previewMetadata: Record<string, unknown> | undefined,
  conversationId?: number,
  timeZone?: string,
): NonNullable<AssistantResponse["interpretedAction"]> {
  const courseLabel =
    readString(previewMetadata?.course_name) ??
    readString(previewMetadata?.course) ??
    "Active course";
  const draftState = buildQuizCreateDraftState(proposed, conversationId, timeZone);

  return {
    action: "Create Quiz",
    course: courseLabel,
    affectedStudents: "Course-wide",
    risk: readRiskMetadata(previewMetadata?.risk_metadata),
    technicalDetails: [
      { label: "Action type", value: "Create Quiz" },
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
      {
        label: "Quiz engine",
        value:
          proposed.quiz_engine === "new_quizzes"
            ? "New Quizzes"
            : "Classic Quizzes",
      },
    ],
    primaryLink: {
      label: "Open quiz creation form",
      href: paths.instructor.quizCreate,
      state: draftState,
    },
  };
}

/** Claim types the backend found in this reply that no Canvas read backs.
 * Absent whenever every claim checks out, so this stays quiet on ordinary
 * replies rather than crying wolf until instructors tune it out. */
function readUnverifiedClaims(
  reply: Record<string, unknown>,
): string[] | undefined {
  const claims = reply.unverified_claims;
  if (!Array.isArray(claims) || claims.length === 0) {
    return undefined;
  }
  const names = claims.filter((claim): claim is string => typeof claim === "string");
  return names.length > 0 ? names : undefined;
}

export function mapChatReplyToAssistantResponse(
  reply: Record<string, unknown>,
  isError: boolean,
  conversationId?: number,
  timeZone?: string,
): AssistantResponse {
  const mapped = mapReplyBody(reply, isError, conversationId);
  const unverifiedClaims = readUnverifiedClaims(reply);
  return unverifiedClaims ? { ...mapped, unverifiedClaims } : mapped;
}

function mapReplyBody(
  reply: Record<string, unknown>,
  isError: boolean,
  conversationId?: number,
): AssistantResponse {
  if (isError || reply.error) {
    const requiresCanvasToken = reply.requires_canvas_token === true;
    const deferredRequestId =
      typeof reply.deferred_request_id === "number"
        ? reply.deferred_request_id
        : undefined;
    const content =
      readString(reply.error) ??
      "The assistant is temporarily unavailable. Please try again.";

    if (requiresCanvasToken) {
      return {
        content,
        explanation:
          "You are in limited mode until Canvas is connected. Saved requests can be resumed after connecting.",
        requiresCanvasToken: true,
        deferredRequestId,
        interpretedAction: {
          action: "Connect Canvas",
          course: "Limited mode",
          affectedStudents: "—",
          primaryLink: {
            label: "Connect Canvas in Settings",
            href: instructorSettingsPath("canvas"),
          },
        },
      };
    }

    return { content };
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

    // Quiz creation redirects to the dedicated form on live turns, and also
    // keeps an "Open quiz creation form" button so reopening chat history
    // can return to the seeded form without a confirmable preview panel.
    if (proposed?.action === "create_quiz") {
      return {
        content:
          readString(reply.summary) ??
          "Opening the quiz creation form with your draft…",
        explanation:
          "Quiz creation happens in the dedicated form so the write is reviewed once and recorded in workflow history.",
        navigateTo: buildQuizCreateNavigateTo(proposed, conversationId, timeZone),
        interpretedAction: buildQuizCreateFormAction(
          proposed,
          previewMetadata,
          conversationId,
          timeZone,
        ),
      };
    }

    // send_message is a form handoff, but the instructor should choose when
    // to leave chat by clicking "Open message draft".
    if (proposed?.action === "send_message") {
      return {
        content:
          readString(reply.summary) ??
          "I prepared a message draft with your details.",
        explanation:
          "Messages are drafted and sent in the Messages tab so the write is reviewed once and recorded in workflow history.",
        interpretedAction: buildMessageDraftFormAction(
          proposed,
          previewMetadata,
          conversationId,
        ),
      };
    }

    // update_grade redirects to the dedicated feedback form.
    if (proposed?.action === "update_grade") {
      return {
        content:
          readString(reply.summary) ??
          "Opening the feedback form with your draft…",
        explanation:
          "Feedback is posted in the dedicated form so the write is reviewed once and recorded in workflow history.",
        navigateTo: buildFeedbackDraftNavigateTo(proposed, conversationId),
      };
    }

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
        timeZone,
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
    const acknowledgedText = acknowledgedFields
      .map((field) => `${field.label.toLowerCase()}: ${field.value}`)
      .join(", ");
    const acknowledgement =
      acknowledgedFields.length > 0
        ? `I have ${acknowledgedText}${/[.!?]$/.test(acknowledgedText) ? " " : ". "}`
        : "";
    const question =
      readString(reply.question) ??
      "Could you share a bit more detail so I can help?";
    const interpretedAction = buildGradeClarifyHandoffAction(
      reply.partial_plan as Record<string, unknown> | undefined,
    );
    if (interpretedAction) {
      return {
        content: `${acknowledgement}${question}`,
        acknowledgedFields,
        interpretedAction,
      };
    }
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
      interpretedAction: buildGradeHandoffAction(
        reply.grade_handoff as Record<string, unknown> | undefined,
      ),
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
