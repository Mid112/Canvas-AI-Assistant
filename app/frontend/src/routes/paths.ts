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
    courseStudents: "/instructor/courses/:localCourseId/students",
    courseGrades: "/instructor/courses/:localCourseId/grades",
    courseMessages: "/instructor/courses/:localCourseId/messages",
    courseSubmissions:
      "/instructor/courses/:localCourseId/assignments/:assignmentId/submissions",
    assignmentUpdate:
      "/instructor/courses/:localCourseId/assignments/:assignmentId/edit",
    assignmentCreate: "/instructor/assignments/create",
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
  },
} as const;

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

export function instructorCourseStudentsPath(localCourseId: number | string) {
  return `/instructor/courses/${localCourseId}/students`;
}

export function instructorCourseGradesPath(localCourseId: number | string) {
  return `/instructor/courses/${localCourseId}/grades`;
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
  tab?: "inbox" | "compose";
}) {
  if (!options?.tab) {
    return paths.instructor.messages;
  }

  const params = new URLSearchParams({ tab: options.tab });
  return `${paths.instructor.messages}?${params.toString()}`;
}

/** Location state used when opening the message draft from the AI assistant. */
export interface AiMessageDraftLocationState {
  aiMessageDraft?: {
    subject?: string;
    body?: string;
    prompt?: string;
    courseId?: number;
    recipientIds?: string[];
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
