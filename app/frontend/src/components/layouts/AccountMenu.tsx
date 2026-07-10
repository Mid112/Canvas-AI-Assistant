import { useNavigate } from "react-router-dom";
import { ChevronUp, LogOut, User } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { getInitials } from "@/lib/user-display";
import { cn } from "@/lib/utils";
import { getProfilePath } from "@/utils/navigation";
import { paths } from "@/routes/paths";
import type { UserRole } from "@/types/user";

interface AccountMenuProps {
  role: UserRole;
  roleLabel: string;
  onNavigate?: () => void;
  trigger?: "icon" | "profile";
  align?: "start" | "end";
  side?: "top" | "bottom";
  className?: string;
}

export function AccountMenu({
  role,
  roleLabel,
  onNavigate,
  trigger = "profile",
  align = "start",
  side = "top",
  className,
}: AccountMenuProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const displayName = user?.name ?? "User";
  const initials = getInitials(displayName);

  const handleNavigate = (path: string) => {
    onNavigate?.();
    navigate(path);
  };

  const handleLogout = () => {
    logout();
    onNavigate?.();
    navigate(paths.login);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          trigger === "profile"
            ? "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-sidebar-accent/60"
            : undefined,
          className,
        )}
        aria-label="Account menu"
      >
        {trigger === "profile" ? (
          <>
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{displayName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {roleLabel}
              </p>
            </div>
            <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
          </>
        ) : (
          <Button variant="outline" size="icon" aria-label="Account menu">
            <User className="size-4" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} side={side} className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{roleLabel}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => handleNavigate(getProfilePath(role))}>
            <User />
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleNavigate(paths.home)}>
            Home
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={handleLogout}>
            <LogOut />
            Log out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
