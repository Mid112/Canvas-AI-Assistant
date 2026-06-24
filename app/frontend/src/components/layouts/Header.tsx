import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Menu, PanelLeft, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Sidebar } from "@/components/layouts/Sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/types/navigation";
import type { UserRole } from "@/types/user";
import { getProfilePath } from "@/utils/navigation";
import { paths } from "@/routes/paths";

interface HeaderProps {
  title: string;
  role: UserRole;
  roleLabel: string;
  navItems: NavItem[];
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

export function Header({
  title,
  role,
  roleLabel,
  navItems,
  sidebarOpen = true,
  onToggleSidebar,
}: HeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate(paths.login);
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-6">
      <div className="flex items-center gap-3">
        {onToggleSidebar ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn("hidden lg:inline-flex", sidebarOpen && "lg:hidden")}
            aria-label="Open sidebar"
            onClick={onToggleSidebar}
          >
            <PanelLeft className="size-4" />
          </Button>
        ) : null}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                className="lg:hidden"
                aria-label="Open navigation menu"
              />
            }
          >
            <Menu className="size-4" />
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation</SheetTitle>
            </SheetHeader>
            <Sidebar
              navItems={navItems}
              role={role}
              roleLabel={roleLabel}
              onNavigate={() => setMobileOpen(false)}
              className="w-full border-0"
            />
          </SheetContent>
        </Sheet>
        <h1 className="text-lg font-semibold tracking-tight md:text-xl">
          {title}
        </h1>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="icon" aria-label="Account menu" />
          }
        >
          <User className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{roleLabel}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate(getProfilePath(role))}>
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate(paths.home)}>
              Home
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={handleLogout}>
              Log out
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
