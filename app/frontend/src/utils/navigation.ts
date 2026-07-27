import {
  Activity,
  BookOpen,
  Bot,
  FileText,
  History,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Users,
  Wrench,
} from "lucide-react";

import type { NavItem } from "@/types/navigation";
import { paths } from "@/routes/paths";
import type { UserRole } from "@/types/user";

export const instructorNavItems: NavItem[] = [
  { title: "Dashboard", href: paths.instructor.dashboard, icon: LayoutDashboard },
  { title: "Courses", href: paths.instructor.courses, icon: BookOpen },
  { title: "AI Assistant", href: paths.instructor.assistant, icon: Bot },
  { title: "Messages", href: paths.instructor.messages, icon: MessageSquare },
  {
    title: "Workflow History",
    href: paths.instructor.history,
    icon: History,
  },
  { title: "Settings", href: paths.instructor.settings, icon: Settings },
];

export const adminNavItems: NavItem[] = [
  { title: "Dashboard", href: paths.admin.dashboard, icon: LayoutDashboard },
  { title: "Users", href: paths.admin.users, icon: Users },
  { title: "Audit Logs", href: paths.admin.audit, icon: FileText },
  { title: "System Health", href: paths.admin.systemHealth, icon: Activity },
  { title: "Troubleshooting", href: paths.admin.troubleshooting, icon: Wrench },
  { title: "Settings", href: paths.admin.settings, icon: Settings },
];

export function getNavItemsForRole(role: UserRole): NavItem[] {
  switch (role) {
    case "instructor":
      return instructorNavItems;
    case "admin":
      return adminNavItems;
  }
}

export function getRoleLabel(role: UserRole): string {
  switch (role) {
    case "instructor":
      return "Instructor";
    case "admin":
      return "Administrator";
  }
}

export function getProfilePath(role: UserRole): string {
  switch (role) {
    case "instructor":
      return paths.instructor.profile;
    case "admin":
      return paths.admin.profile;
  }
}

export function getDashboardPath(role: UserRole): string {
  switch (role) {
    case "instructor":
      return paths.instructor.dashboard;
    case "admin":
      return paths.admin.dashboard;
  }
}

export function getAssistantPath(role: UserRole): string {
  switch (role) {
    case "instructor":
      return paths.instructor.assistant;
    case "admin":
      return paths.admin.dashboard;
  }
}

/** Returns a copy of `navItems` with the System Health entry's `badge` set
 * from the latest known overall status — only that one entry is touched,
 * and only when there's something to flag (a healthy status renders no
 * badge, matching Sidebar's calm-by-default treatment). "unknown" (nothing
 * checked yet) is treated the same as calm -- it's not a confirmed problem,
 * so it shouldn't render as one, but it's also deliberately not folded into
 * "healthy" at the data layer (see LatestOverallStatus). */
export function decorateNavItemsWithHealth(
  navItems: NavItem[],
  overallStatus: "healthy" | "degraded" | "down" | "unknown" | undefined,
): NavItem[] {
  if (!overallStatus || overallStatus === "healthy" || overallStatus === "unknown") {
    return navItems;
  }

  return navItems.map((item) =>
    item.href === paths.admin.systemHealth ? { ...item, badge: overallStatus } : item,
  );
}
