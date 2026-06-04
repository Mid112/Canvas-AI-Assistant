export const paths = {
  home: "/",
  login: "/login",
  register: "/register",
  instructor: {
    dashboard: "/instructor/dashboard",
    courses: "/instructor/courses",
    assistant: "/instructor/assistant",
    history: "/instructor/history",
    settings: "/instructor/settings",
  },
  ta: {
    dashboard: "/ta/dashboard",
    courses: "/ta/courses",
    messages: "/ta/messages",
    students: "/ta/students",
    settings: "/ta/settings",
  },
  admin: {
    dashboard: "/admin/dashboard",
    users: "/admin/users",
    audit: "/admin/audit",
    settings: "/admin/settings",
  },
} as const;
