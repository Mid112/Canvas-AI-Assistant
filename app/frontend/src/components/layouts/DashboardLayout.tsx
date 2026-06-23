import { Outlet, useLocation } from "react-router-dom";

import { Header } from "@/components/layouts/Header";
import { Sidebar } from "@/components/layouts/Sidebar";
import { InstitutionProvider } from "@/contexts/InstitutionContext";
import {
  getNavItemsForRole,
  getProfilePath,
  getRoleLabel,
} from "@/utils/navigation";
import type { UserRole } from "@/types/user";

interface DashboardLayoutProps {
  role: UserRole;
}

function getPageTitle(pathname: string, role: UserRole): string {
  if (pathname === getProfilePath(role)) {
    return "Profile";
  }
  const navItems = getNavItemsForRole(role);
  const match = navItems.find((item) => pathname.startsWith(item.href));
  return match?.title ?? getRoleLabel(role);
}

function DashboardShell({ role }: DashboardLayoutProps) {
  const { pathname } = useLocation();
  const navItems = getNavItemsForRole(role);
  const roleLabel = getRoleLabel(role);
  const title = getPageTitle(pathname, role);

  return (
    <div className="flex min-h-svh w-full bg-[#f4f7fb]">
      <div className="hidden lg:flex">
        <Sidebar navItems={navItems} role={role} roleLabel={roleLabel} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          title={title}
          role={role}
          roleLabel={roleLabel}
          navItems={navItems}
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
