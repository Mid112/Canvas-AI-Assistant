import { Link, NavLink } from "react-router-dom";
import { GraduationCap, PanelLeftClose } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SidebarProfile } from "@/components/layouts/SidebarProfile";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/types/navigation";
import { paths } from "@/routes/paths";
import type { UserRole } from "@/types/user";

interface SidebarProps {
  navItems: NavItem[];
  role: UserRole;
  roleLabel: string;
  onNavigate?: () => void;
  onToggle?: () => void;
  showToggle?: boolean;
  className?: string;
}

export function Sidebar({
  navItems,
  role,
  roleLabel,
  onNavigate,
  onToggle,
  showToggle = false,
  className,
}: SidebarProps) {
  return (
    <aside
      className={cn(
        "flex h-full w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
        className,
      )}
    >
      <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-3">
        <Link
          to={paths.home}
          onClick={onNavigate}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-2 transition-colors hover:bg-sidebar-accent/60"
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <GraduationCap className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-sidebar-foreground">
              {BRAND.shortName}
            </p>
            <p className="truncate text-xs text-sidebar-foreground/70">
              {roleLabel} Portal
            </p>
          </div>
        </Link>
        {showToggle && onToggle ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-sidebar-foreground/70 hover:text-sidebar-foreground"
            aria-label="Close sidebar"
            onClick={onToggle}
          >
            <PanelLeftClose className="size-4" />
          </Button>
        ) : null}
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {navItems.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground/90 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )
            }
          >
            <item.icon className="size-4 shrink-0" aria-hidden="true" />
            {item.title}
          </NavLink>
        ))}
      </nav>
      <SidebarProfile role={role} roleLabel={roleLabel} onNavigate={onNavigate} />
    </aside>
  );
}
