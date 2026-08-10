export const paths = {
  home: "/",
  login: "/login",
  register: "/register",
  canvasInfo: "/canvas-info",
  connectCanvas: "/connect-canvas",
  resetPassword: "/reset-password",
  reviewPermissions: "/review-permissions",
  canvasAuthError: "/canvas-auth-error",
  instructor: {
    dashboard: "/instructor/dashboard",
    courses: "/instructor/courses",
    course: "/instructor/courses/:localCourseId",
    courseAssignments: "/instructor/courses/:localCourseId/assignments",
    courseQuizzes: "/instructor/courses/:localCourseId/quizzes",
    courseStudents: "/instructor/courses/:localCourseId/students",
    courseGrades: "/instructor/courses/:localCourseId/grades",
    courseMessages: "/instructor/courses/:localCourseId/messages",
    courseSubmissions:
      "/instructor/courses/:localCourseId/assignments/:assignmentId/submissions",
    assignmentUpdate:
      "/instructor/courses/:localCourseId/assignments/:assignmentId/edit",
    assignmentCreate: "/instructor/assignments/create",
    quizCreate: "/instructor/quizzes/create",
    feedbackCreate: "/instructor/feedback/create",
    courseAnalytics: "/instructor/courses/:courseId/analytics",
    assistant: "/instructor/assistant",
    dryRunPreview: "/instructor/actions/preview",
    analytics: "/instructor/analytics",
    messages: "/instructor/messages",
    notifications: "/instructor/notifications",
    history: "/instructor/history",
    settings: "/instructor/settings",
    profile: "/instructor/profile",
  },
  admin: {
    dashboard: "/admin/dashboard",
    users: "/admin/users",
    audit: "/admin/audit",
    settings: "/admin/settings",
    profile: "/admin/profile",
    systemHealth: "/admin/system-health",
    troubleshooting: "/admin/troubleshooting",
    // Drill-in destination reached via the "View failed operations" button
    // on Troubleshooting -- not a peer nav item (avoids duplicating that
    // page's entry point).
    failedOperations: "/admin/failed-operations",
  },
} as const;

/** Deep-links /admin/users pre-filtered to just the instructors with a
 * failing Canvas connection -- reached via "Manage instructors" on
 * Troubleshooting's Instructor Canvas connections card, so it lands on
 * exactly who that card named instead of the full roster. */
export function adminInstructorsFailingCanvasPath() {
  return `${paths.admin.users}?canvasStatus=failing`;
}

export function instructorSettingsPath(
  tab?: "canvas" | "notifications" | "security" | "ai-models",
) {
  if (!tab) {
    return paths.instructor.settings;
  }

  return `${paths.instructor.settings}?tab=${tab}`;
}

export function instructorCoursePath(localCourseId: number | string) {
  return `/instructor/courses/${localCourseId}`;
}

export function instructorCourseAssignmentsPath(localCourseId: number | string) {
  return `/instructor/courses/${localCourseId}/assignments`;
}

export function instructorCourseQuizzesPath(localCourseId: number | string) {
  return `/instructor/courses/${localCourseId}/quizzes`;
}

export function instructorCourseStudentsPath(localCourseId: number | string) {
  return `/instructor/courses/${localCourseId}/students`;
}

export function instructorCourseGradesPath(localCourseId: number | string) {
  return `/instructor/courses/${localCourseId}/grades`;
}

export function instructorCourseGradesPrefillPath(
  localCourseId: number | string,
  options?: {
    assignmentId?: number | string;
    studentIds?: Array<number | string>;
    grade?: string;
    reason?: string | null;
  },
) {
  // AI grade requests resolve real Canvas-backed ids server-side, then land
  // here as URL params so the Grades page can reuse its normal preview and
  // approval workflow instead of inventing a separate chat-only editor.
  const params = new URLSearchParams();
  if (options?.assignmentId !== undefined) {
    params.set("assignmentId", String(options.assignmentId));
  }
  if (options?.studentIds?.length) {
    params.set("studentIds", options.studentIds.map(String).join(","));
  }
  if (options?.grade) {
    params.set("grade", options.grade);
  }
  if (options?.reason) {
    params.set("reason", options.reason);
  }

  const query = params.toString();
  return `${instructorCourseGradesPath(localCourseId)}${query ? `?${query}` : ""}`;
}

export function instructorCourseSubmissionsPath(
  localCourseId: number | string,
  assignmentId: number | string,
) {
  return `/instructor/courses/${localCourseId}/assignments/${assignmentId}/submissions`;
}

export function instructorCourseMessagesPath(localCourseId: number | string) {
  return `/instructor/courses/${localCourseId}/messages`;
}

export function instructorCourseAnalyticsPath(courseId: number | string) {
  return `/instructor/courses/${courseId}/analytics`;
}

export function instructorAssignmentUpdatePath(
  localCourseId: number | string,
  assignmentId: number | string,
) {
  return `/instructor/courses/${localCourseId}/assignments/${assignmentId}/edit`;
}

export function instructorDryRunPreviewPath(previewId: string) {
  const params = new URLSearchParams({ preview: previewId });
  return `${paths.instructor.dryRunPreview}?${params.toString()}`;
}

export function instructorMessagesPath(options?: {
  tab?: "inbox" | "compose" | "announcements" | "sent";
}) {
  if (!options?.tab) {
    return paths.instructor.messages;
  }

  const params = new URLSearchParams({ tab: options.tab });
  return `${paths.instructor.messages}?${params.toString()}`;
}

/** Location state used when opening the message draft from the AI assistant. */
export interface AiMessageDraftLocationState {
  /** When set, discard this typed draft after a successful Canvas send. */
  typedDraftId?: string;
  aiMessageDraft?: {
    subject?: string;
    body?: string;
    prompt?: string;
    courseId?: number;
    recipientIds?: string[];
    deliveryMode?: "announcement" | "private_message";
    conversationId?: number;
  };
}

/** Structured action drafts passed from an assistant preview into the
 * dedicated validated review forms. */
export interface AiActionDraftLocationState {
  returnTo?: string;
  /** When set, discard this typed draft after a successful Canvas confirm. */
  typedDraftId?: string;
  aiAssignmentDraft?: {
    courseId?: number;
    name?: string;
    description?: string;
    dueDate?: string;
    pointsPossible?: unknown;
    /** Describe-step seed when no generated title/description exists yet. */
    prompt?: string;
    /** Set when this draft came from an assistant intent_preview. Sent back
     * on approve so the pending Workflow chat opened for that preview is
     * closed out and audited, instead of being left pending forever. */
    conversationId?: number;
    pendingMessageId?: number;
  };
  aiQuizDraft?: {
    courseId?: number;
    name?: string;
    description?: string;
    dueDate?: string;
    pointsPossible?: unknown;
    allowedAttempts?: unknown;
    timeLimit?: unknown;
    quizEngine?: "classic" | "new_quizzes";
    conversationId?: number;
    /** Describe-step seed when structured questions are missing. */
    prompt?: string;
    /** Ticket 45 / #1506 — prior per-question points from a saved draft,
     * reapplied after Generate when the new question count matches. */
    priorQuestionPoints?: number[];
    questionBankGroups?: Array<{
      bankId: number;
      bankName: string;
      pickCount: number;
      questionPoints: number;
    }>;
    questions?: Array<{
      questionText: string;
      questionType:
        | "multiple_choice_question"
        | "true_false_question"
        | "short_answer_question"
        | "essay_question";
      pointsPossible: number;
      answers: Array<{ text: string; weight: number }>;
    }>;
  };
  aiFeedbackDraft?: {
    courseId?: number;
    assignmentId?: number;
    studentId?: number;
    assignmentName?: string;
    studentName?: string;
    newGrade?: string;
    feedback?: string;
    conversationId?: number;
    /** Describe-step seed when assignment/student ids are missing. */
    prompt?: string;
  };
}

export function instructorChatPreviewPath(
  conversationId: number,
  pendingMessageId: number,
) {
  const params = new URLSearchParams({
    conversation: String(conversationId),
    pending: String(pendingMessageId),
  });
  return `${paths.instructor.dryRunPreview}?${params.toString()}`;
}
