import {
  BookOpen,
  Bot,
  FileText,
  History,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Users,
} from "lucide-react";

import type { NavItem } from "@/types/navigation";
import { paths } from "@/routes/paths";
import type { UserRole } from "@/types/user";

export const instructorNavItems: NavItem[] = [
  { title: "Dashboard", href: paths.instructor.dashboard, icon: LayoutDashboard },
  { title: "Courses", href: paths.instructor.courses, icon: BookOpen },
  { title: "AI Assistant", href: paths.instructor.assistant, icon: Bot },
  { title: "History", href: paths.instructor.history, icon: History },
  { title: "Settings", href: paths.instructor.settings, icon: Settings },
];

export const taNavItems: NavItem[] = [
  { title: "Dashboard", href: paths.ta.dashboard, icon: LayoutDashboard },
  { title: "Courses", href: paths.ta.courses, icon: BookOpen },
  { title: "Messages", href: paths.ta.messages, icon: MessageSquare },
  { title: "Students", href: paths.ta.students, icon: Users },
  { title: "Settings", href: paths.ta.settings, icon: Settings },
];

export const adminNavItems: NavItem[] = [
  { title: "Dashboard", href: paths.admin.dashboard, icon: LayoutDashboard },
  { title: "Users", href: paths.admin.users, icon: Users },
  { title: "Audit Logs", href: paths.admin.audit, icon: FileText },
  { title: "Settings", href: paths.admin.settings, icon: Settings },
];

export function getNavItemsForRole(role: UserRole): NavItem[] {
  switch (role) {
    case "instructor":
      return instructorNavItems;
    case "ta":
      return taNavItems;
    case "admin":
      return adminNavItems;
  }
}

export function getRoleLabel(role: UserRole): string {
  switch (role) {
    case "instructor":
      return "Instructor";
    case "ta":
      return "Teaching Assistant";
    case "admin":
      return "Administrator";
  }
}
