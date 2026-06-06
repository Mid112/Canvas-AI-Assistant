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
    profile: "/instructor/profile",
  },
  ta: {
    dashboard: "/ta/dashboard",
    courses: "/ta/courses",
    messages: "/ta/messages",
    students: "/ta/students",
    settings: "/ta/settings",
    profile: "/ta/profile",
  },
  admin: {
    dashboard: "/admin/dashboard",
    users: "/admin/users",
    audit: "/admin/audit",
    settings: "/admin/settings",
    profile: "/admin/profile",
  },
} as const;
