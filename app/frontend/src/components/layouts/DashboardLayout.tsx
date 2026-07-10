import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { Header } from "@/components/layouts/Header";
import { Sidebar } from "@/components/layouts/Sidebar";
import { ActiveCourseProvider } from "@/contexts/ActiveCourseProvider";
import { InstitutionProvider } from "@/contexts/InstitutionProvider";
import {
  getStoredSidebarOpen,
  setStoredSidebarOpen,
} from "@/lib/sidebar-storage";
import { cn } from "@/lib/utils";
import {
  getNavItemsForRole,
  getProfilePath,
  getRoleLabel,
} from "@/utils/navigation";
import { paths } from "@/routes/paths";
import type { UserRole } from "@/types/user";

interface DashboardLayoutProps {
  role: UserRole;
}

function getPageTitle(pathname: string, role: UserRole): string {
  if (pathname === getProfilePath(role)) {
    return "Profile";
  }

  if (role === "instructor" && pathname === paths.instructor.notifications) {
    return "Notifications";
  }

  if (role === "instructor" && pathname.includes("/analytics")) {
    return "Submission Analytics";
  }

  const navItems = getNavItemsForRole(role);
  const match = navItems.find((item) => pathname.startsWith(item.href));
  if (pathname === paths.instructor.assignmentCreate) {
    return "AI Assignment Creator";
  }
  if (pathname === paths.instructor.dryRunPreview) {
    return "Workflow Preview";
  }
  if (pathname.includes("/students")) {
    return "Course Students";
  }
  if (pathname.includes("/submissions")) {
    return "Assignment Submissions";
  }
  if (pathname.includes("/assignments/") && pathname.endsWith("/edit")) {
    return "Update Assignment";
  }
  if (pathname.includes("/assignments")) {
    return "Course Assignments";
  }
  return match?.title ?? getRoleLabel(role);
}

function DashboardShell({ role }: DashboardLayoutProps) {
  const { pathname } = useLocation();
  const navItems = getNavItemsForRole(role);
  const roleLabel = getRoleLabel(role);
  const title = getPageTitle(pathname, role);
  const [sidebarOpen, setSidebarOpen] = useState(() => getStoredSidebarOpen());

  useEffect(() => {
    setStoredSidebarOpen(sidebarOpen);
  }, [sidebarOpen]);

  const toggleSidebar = () => {
    setSidebarOpen((open) => !open);
  };

  return (
    <div className="flex h-svh w-full overflow-hidden bg-background">
      <div
        className={cn(
          "hidden h-svh shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out lg:block",
          sidebarOpen ? "w-64" : "w-0",
        )}
      >
        <Sidebar
          navItems={navItems}
          roleLabel={roleLabel}
          showToggle
          onToggle={toggleSidebar}
        />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Header
          title={title}
          role={role}
          roleLabel={roleLabel}
          navItems={navItems}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={toggleSidebar}
        />
        <main className="flex min-h-0 flex-1 flex-col overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function DashboardLayout({ role }: DashboardLayoutProps) {
  const content = <DashboardShell role={role} />;

  return (
    <InstitutionProvider>
      {role === "instructor" ? (
        <ActiveCourseProvider>{content}</ActiveCourseProvider>
      ) : (
        content
      )}
    </InstitutionProvider>
  );
}
