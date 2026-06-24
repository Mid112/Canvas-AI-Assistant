import { useNavigate } from "react-router-dom";
import {
  Building2,
  Check,
  ChevronUp,
  LogOut,
  Settings,
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
import { useAuth } from "@/contexts/AuthContext";
import { useInstitution } from "@/contexts/useInstitution";
import { getInitials } from "@/lib/user-display";
import { cn } from "@/lib/utils";
import { getProfilePath, getRoleLabel } from "@/utils/navigation";
import { paths } from "@/routes/paths";
import type { UserRole } from "@/types/user";

interface SidebarProfileProps {
  role: UserRole;
  onNavigate?: () => void;
  className?: string;
}

export function SidebarProfile({
  role,
  onNavigate,
  className,
}: SidebarProfileProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { institutions, selectedInstitution, setSelectedInstitution } =
    useInstitution();

  const displayName = user?.name ?? "User";
  const roleLabel = getRoleLabel(role);
  const initials = getInitials(displayName);
  const showInstitutionSwitcher = role === "instructor" && institutions.length > 1;

  const handleLogout = () => {
    logout();
    onNavigate?.();
    navigate(paths.login);
  };

  return (
    <div className={cn("border-t border-sidebar-border p-3", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-sidebar-accent/60"
          aria-label="Open profile menu"
        >
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
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-64">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{displayName}</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => {
                onNavigate?.();
                navigate(getProfilePath(role));
              }}
            >
              <User />
              Profile settings
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                onNavigate?.();
                navigate(
                  role === "instructor"
                    ? paths.instructor.settings
                    : role === "ta"
                      ? paths.ta.settings
                      : paths.admin.settings,
                );
              }}
            >
              <Settings />
              Account settings
            </DropdownMenuItem>
          </DropdownMenuGroup>
          {showInstitutionSwitcher ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel className="flex items-center gap-2">
                  <Building2 className="size-4" />
                  Switch institution
                </DropdownMenuLabel>
                {institutions.map((institution) => (
                  <DropdownMenuItem
                    key={institution.id}
                    onClick={() => setSelectedInstitution(institution.id)}
                  >
                    <span className="flex size-4 items-center justify-center">
                      {selectedInstitution.id === institution.id ? (
                        <Check className="size-4" />
                      ) : null}
                    </span>
                    {institution.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem variant="destructive" onClick={handleLogout}>
              <LogOut />
              Log out
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
