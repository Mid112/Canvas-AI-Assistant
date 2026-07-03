import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { Header } from "@/components/layouts/Header";
import { Sidebar } from "@/components/layouts/Sidebar";
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

  const navItems = getNavItemsForRole(role);
  const match = navItems.find((item) => pathname.startsWith(item.href));
  if (pathname === paths.instructor.assignmentCreate) {
    return "AI Assignment Creator";
  }
  if (pathname === paths.instructor.dryRunPreview) {
    return "Workflow Preview";
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
    <div className="flex min-h-svh w-full bg-[#f4f7fb]">
      <div
        className={cn(
          "hidden shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out lg:block",
          sidebarOpen ? "w-64" : "w-0",
        )}
      >
        <Sidebar
          navItems={navItems}
          role={role}
          roleLabel={roleLabel}
          showToggle
          onToggle={toggleSidebar}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          title={title}
          role={role}
          roleLabel={roleLabel}
          navItems={navItems}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={toggleSidebar}
        />
        <main className="flex flex-1 flex-col overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function DashboardLayout({ role }: DashboardLayoutProps) {
  return (
    <InstitutionProvider>
      <DashboardShell role={role} />
    </InstitutionProvider>
  );
}
