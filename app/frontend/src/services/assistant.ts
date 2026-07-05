import {
  instructorCourseAnalyticsPath,
  instructorDryRunPreviewPath,
  paths,
} from "@/routes/paths";
import type { AssistantContext, AssistantResponse } from "@/types/chat";

export class AssistantApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssistantApiError";
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function randomDelayMs(): number {
  return 1000 + Math.floor(Math.random() * 1000);
}

function defaultCourseLabel(context: AssistantContext): string {
  return context.activeCourseLabel ?? "COSC 499";
}

function defaultCourseId(context: AssistantContext): number {
  return context.activeCourseId ?? 1;
}

const UNSAFE_PATTERNS = [
  /\b(delete|erase|remove|wipe|purge)\s+(all|every)\b/,
  /\b(delete|erase|remove|wipe|purge)\s+(all|every)\s+\w*\s*students?\b/,
  /drop\s+(the\s+)?course/,
  /fail\s+(all|every)/,
  /grade\s+.*\s+to\s+0/,
  /without\s+(approval|preview|confirm)/,
  /skip\s+(approval|preview)/,
  /execute\s+immediately/,
  /hack|breach|exploit/,
];

const VAGUE_PATTERNS = [
  /^do\s+it\.?$/i,
  /^help\.?$/i,
  /^update\s+assignment\.?$/i,
  /^send\s+(a\s+)?message\.?$/i,
  /^fix\s+it\.?$/i,
];

function isUnsafeRequest(message: string): string | null {
  const normalized = message.toLowerCase().trim();

  for (const pattern of UNSAFE_PATTERNS) {
    if (pattern.test(normalized)) {
      return "This request could make irreversible changes or bypass required approval. I cannot complete it as written. Try describing a specific, reviewable action such as sending reminders or updating one assignment.";
    }
  }

  return null;
}

function isVagueRequest(message: string): string | null {
  const trimmed = message.trim();

  if (trimmed.length < 4) {
    return "Your request is too short for me to interpret safely. Please include the course, assignment, and what you want to do.";
  }

  for (const pattern of VAGUE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return "I need more detail before I can help. Specify the course, affected students or assignment, and the action you want to take.";
    }
  }

  if (
    /\bupdate\b/.test(trimmed.toLowerCase()) &&
    !/\bdue\b/.test(trimmed.toLowerCase()) &&
    !/\bdate\b/.test(trimmed.toLowerCase()) &&
    !/\bname\b/.test(trimmed.toLowerCase())
  ) {
    return "To update an assignment, tell me which assignment to change and what field to update (for example, a new due date).";
  }

  if (
    /\bsend\b/.test(trimmed.toLowerCase()) &&
    /\bmessage\b/.test(trimmed.toLowerCase()) &&
    !/\b(student|reminder|missing|late)\b/.test(trimmed.toLowerCase())
  ) {
    return "To draft a message, tell me which students or group should receive it and what the message is about.";
  }

  return null;
}

function buildMockResponse(
  message: string,
  context: AssistantContext,
): AssistantResponse {
  const normalized = message.toLowerCase();
  const courseLabel = defaultCourseLabel(context);
  const courseId = defaultCourseId(context);

  const unsafeReason = isUnsafeRequest(message);
  if (unsafeReason) {
    return {
      content:
        "I cannot complete that request because it may be unsafe or bypass required review.",
      safetyBlocked: true,
      safetyMessage: unsafeReason,
    };
  }

  const vagueReason = isVagueRequest(message);
  if (vagueReason) {
    return {
      content: "I need a bit more information before I can help with that.",
      safetyBlocked: true,
      safetyMessage: vagueReason,
    };
  }

  if (
    normalized.includes("how many students") ||
    normalized.includes("student count") ||
    normalized.includes("enrollment")
  ) {
    return {
      content: `${courseLabel} currently has 42 enrolled students (38 active, 4 inactive).`,
      explanation:
        "I read enrollment data from the connected Canvas course roster.",
    };
  }

  if (
    normalized.includes("how many assignment") ||
    normalized.includes("assignment count")
  ) {
    return {
      content: `${courseLabel} has 12 published assignments and 2 unpublished drafts.`,
      explanation:
        "I counted assignments in the course gradebook, grouped by published state.",
    };
  }

  if (
    normalized.includes("performance") ||
    normalized.includes("analytics") ||
    normalized.includes("dashboard")
  ) {
    return {
      content: `Here is a snapshot for ${courseLabel}: 87% average submission rate, 9 missing submissions, and 5 late submissions across active assignments.`,
      explanation:
        "I aggregated submission timestamps and gradebook status for each assignment.",
      interpretedAction: {
        action: "View Analytics",
        course: courseLabel,
        affectedStudents: "Course-wide",
        primaryLink: {
          label: "Open course analytics",
          href: instructorCourseAnalyticsPath(courseId),
        },
        secondaryLink: {
          label: "View institution analytics",
          href: paths.instructor.analytics,
        },
      },
    };
  }

  if (
    normalized.includes("missing") ||
    normalized.includes("reminder") ||
    normalized.includes("submission")
  ) {
    return {
      content:
        "I found students who have not submitted the assignment yet. You can preview reminder messages before anything is sent.",
      explanation:
        "I analyzed submission data and identified students who have not submitted Assignment 3.",
      interpretedAction: {
        action: "Send Reminder",
        course: courseLabel,
        affectedStudents: "12 students",
        previewId: "workflow-student-reminder",
        primaryLink: {
          label: "Preview workflow",
          href: instructorDryRunPreviewPath("workflow-student-reminder"),
        },
        secondaryLink: {
          label: "Review message draft",
          href: paths.instructor.messages,
        },
      },
    };
  }

  if (normalized.includes("quiz") || normalized.includes("summarize")) {
    return {
      content:
        "Quiz 2 had an average score of 78%. Most students performed well on questions 1–3, while question 4 had the lowest scores.",
      explanation:
        "I reviewed gradebook data and grouped results by question to highlight areas where students struggled.",
    };
  }

  if (normalized.includes("late") || normalized.includes("overdue")) {
    return {
      content:
        "There are 5 late assignments. I can draft reminder messages and show you a dry-run preview before anything is sent.",
      explanation:
        "I compared due dates against submission timestamps to identify overdue work.",
      interpretedAction: {
        action: "Draft Reminders",
        course: courseLabel,
        affectedStudents: "5 students",
        previewId: "workflow-student-reminder",
        primaryLink: {
          label: "Preview workflow",
          href: instructorDryRunPreviewPath("workflow-student-reminder"),
        },
        secondaryLink: {
          label: "Open message drafts",
          href: paths.instructor.messages,
        },
      },
    };
  }

  if (
    (normalized.includes("update") || normalized.includes("change")) &&
    (normalized.includes("due") || normalized.includes("date"))
  ) {
    return {
      content:
        "I can update the assignment due date after you review the proposed Canvas changes.",
      explanation:
        "I located the assignment in your active course and prepared an update workflow for your approval.",
      interpretedAction: {
        action: "Update Due Date",
        course: courseLabel,
        affectedStudents: "All enrolled students",
        previewId: "workflow-assignment-update",
        primaryLink: {
          label: "Preview changes",
          href: instructorDryRunPreviewPath("workflow-assignment-update"),
        },
      },
    };
  }

  if (normalized.includes("announcement") || normalized.includes("post")) {
    return {
      content:
        "I can help draft a course announcement. Open the message editor to review recipients and content before posting.",
      explanation:
        "Announcements are created as drafts so you can edit wording before they go to students.",
      interpretedAction: {
        action: "Draft Announcement",
        course: courseLabel,
        affectedStudents: "All enrolled students",
        primaryLink: {
          label: "Open message drafts",
          href: paths.instructor.messages,
        },
      },
    };
  }

  return {
    content:
      "I can help with course management, assignments, announcements, and student performance. Try asking about missing submissions, quiz summaries, late assignments, or how many students are enrolled.",
  };
}

/** Mock assistant API — simulates network delay and optional failure. */
export async function sendAssistantMessage(
  message: string,
  context: AssistantContext = {},
): Promise<AssistantResponse> {
  await delay(randomDelayMs());

  if (message.toLowerCase().includes("fail please")) {
    throw new AssistantApiError(
      "The assistant is temporarily unavailable. Please try again.",
    );
  }

  return buildMockResponse(message, context);
}
