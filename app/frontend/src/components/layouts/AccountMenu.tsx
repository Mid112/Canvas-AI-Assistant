// Component note: renders reusable account menu UI for the instructor/admin experience.

import { useNavigate } from "react-router-dom";
import {
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  Home,
  LogOut,
  Settings2,
  User,
} from "lucide-react";

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
import { useInstitution } from "@/contexts/useInstitution";
import { getInitials } from "@/lib/user-display";
import { cn } from "@/lib/utils";
import { getProfilePath } from "@/utils/navigation";
import { instructorSettingsPath, paths } from "@/routes/paths";
import type { UserRole } from "@/types/user";

interface AccountMenuProps {
  role: UserRole;
  roleLabel?: string;
  onNavigate?: () => void;
  trigger?: "icon" | "profile";
  align?: "start" | "end";
  side?: "top" | "bottom";
  className?: string;
  chevronDirection?: "up" | "down";
}

export function AccountMenu({
  role,
  roleLabel,
  onNavigate,
  trigger = "profile",
  align = "start",
  side = "top",
  className,
  chevronDirection = "up",
}: AccountMenuProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { selectedInstitution, institutions, setSelectedInstitution } =
    useInstitution();

  const displayName = user?.name ?? "User";
  const initials = getInitials(displayName);
  const ChevronIcon = chevronDirection === "down" ? ChevronDown : ChevronUp;
  const showInstitution = role === "instructor";
  const subtitle = roleLabel;

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
      {trigger === "profile" ? (
        <DropdownMenuTrigger
          className={cn(
            "flex items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-sidebar-accent/60",
            className,
          )}
          aria-label="Account menu"
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-sidebar-foreground">
              {displayName}
            </p>
            {subtitle ? (
              <p className="truncate text-xs text-sidebar-foreground/70">
                {subtitle}
              </p>
            ) : null}
          </div>
          <ChevronIcon className="size-4 shrink-0 text-sidebar-foreground/70" />
        </DropdownMenuTrigger>
      ) : (
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="icon" aria-label="Account menu" />
          }
        >
          <User className="size-4" />
        </DropdownMenuTrigger>
      )}
      <DropdownMenuContent align={align} side={side} className="min-w-56">
        {showInstitution ? (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Institution</DropdownMenuLabel>
              {institutions.length > 0 ? (
                institutions.map((institution) => {
                  const isActive = institution.id === selectedInstitution.id;
                  return (
                    <DropdownMenuItem
                      key={institution.id}
                      onClick={() => setSelectedInstitution(institution.id)}
                      className="flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-sm font-medium">
                          {institution.shortName}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {institution.canvasUrl ?? institution.name}
                        </p>
                      </div>
                      {isActive ? (
                        <Check
                          className="mt-0.5 size-4 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                      ) : null}
                    </DropdownMenuItem>
                  );
                })
              ) : (
                <DropdownMenuItem
                  onClick={() => handleNavigate(instructorSettingsPath("canvas"))}
                  className="gap-2"
                >
                  <Building2 className="size-4" aria-hidden="true" />
                  Connect institution
                </DropdownMenuItem>
              )}
              {institutions.length > 0 ? (
                <DropdownMenuItem
                  onClick={() => handleNavigate(instructorSettingsPath("canvas"))}
                  className="gap-2"
                >
                  <Settings2 className="size-4" aria-hidden="true" />
                  Manage connections
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => handleNavigate(getProfilePath(role))}>
            <User />
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleNavigate(paths.home)}>
            <Home />
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
