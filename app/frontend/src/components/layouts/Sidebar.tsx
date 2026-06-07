import { Link, NavLink } from "react-router-dom";
import { GraduationCap, Home, LogOut } from "lucide-react";

import { cn } from "@/lib/utils";
import type { NavItem } from "@/types/navigation";
import { paths } from "@/routes/paths";

interface SidebarProps {
  navItems: NavItem[];
  roleLabel: string;
  onNavigate?: () => void;
  className?: string;
}

const footerLinkClass =
  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground";

export function Sidebar({
  navItems,
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
          <p className="truncate text-sm font-semibold">Canvas Workflow</p>
          <p className="truncate text-xs text-muted-foreground">{roleLabel}</p>
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
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )
            }
          >
            <item.icon className="size-4 shrink-0" />
            <span>{item.title}</span>
          </NavLink>
        ))}
        <Link to={paths.home} onClick={onNavigate} className={footerLinkClass}>
          <LogOut className="size-4 shrink-0" />
          <span>Log out</span>
        </Link>
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <Link to={paths.home} onClick={onNavigate} className={footerLinkClass}>
          <Home className="size-4 shrink-0" />
          <span>Home</span>
        </Link>
      </div>
    </aside>
  );
}
