import { Link, NavLink } from "react-router-dom";
import { GraduationCap } from "lucide-react";

import { SidebarProfile } from "@/components/layouts/SidebarProfile";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/types/navigation";
import { paths } from "@/routes/paths";
import type { UserRole } from "@/types/user";

interface SidebarProps {
  navItems: NavItem[];
  role: UserRole;
  roleLabel: string;
  onNavigate?: () => void;
  className?: string;
}

export function Sidebar({
  navItems,
  role,
  roleLabel,
  onNavigate,
  className,
}: SidebarProps) {
  return (
    <aside
      className={cn(
        "flex h-full w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
        className,
      )}
    >
      <Link
        to={paths.home}
        onClick={onNavigate}
        className="flex h-16 items-center gap-2 border-b border-sidebar-border px-4 transition-colors hover:bg-sidebar-accent/40"
      >
        <div className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
          <GraduationCap className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">Canvas AI</p>
          <p className="truncate text-xs text-muted-foreground">{roleLabel} Portal</p>
        </div>
      </Link>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {navItems.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
              )
            }
          >
            <item.icon className="size-4 shrink-0" />
            <span>{item.title}</span>
          </NavLink>
        ))}
      </nav>
      <SidebarProfile role={role} onNavigate={onNavigate} />
    </aside>
  );
}
