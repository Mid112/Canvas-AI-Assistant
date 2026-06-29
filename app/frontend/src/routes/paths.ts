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
    courseAssignments: "/instructor/courses/:localCourseId/assignments",
    assignmentUpdate:
      "/instructor/courses/:localCourseId/assignments/:assignmentId/edit",
    assignmentCreate: "/instructor/assignments/create",
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

export function instructorCourseAssignmentsPath(localCourseId: number | string) {
  return `/instructor/courses/${localCourseId}/assignments`;
}

export function instructorAssignmentUpdatePath(
  localCourseId: number | string,
  assignmentId: number | string,
) {
  return `/instructor/courses/${localCourseId}/assignments/${assignmentId}/edit`;
}
