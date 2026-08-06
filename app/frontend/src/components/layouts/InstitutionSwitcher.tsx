import { Building2, Check, ChevronDown, Settings2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

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
import { useInstitution } from "@/contexts/useInstitution";
import { cn } from "@/lib/utils";
import { instructorSettingsPath } from "@/routes/paths";

interface InstitutionSwitcherProps {
  onNavigate?: () => void;
  className?: string;
}

export function InstitutionSwitcher({
  onNavigate,
  className,
}: InstitutionSwitcherProps) {
  const navigate = useNavigate();
  const { institutions, selectedInstitution, setSelectedInstitution } =
    useInstitution();

  if (institutions.length === 0) {
    return (
      <Button
        type="button"
        variant="ghost"
        className={cn(
          "h-auto w-full justify-start gap-2 rounded-lg px-2 py-2 text-left text-sidebar-foreground/90 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          className,
        )}
        onClick={() => {
          onNavigate?.();
          navigate(instructorSettingsPath("canvas"));
        }}
      >
        <Building2 className="size-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-sm">Connect institution</span>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            className={cn(
              "h-auto w-full justify-start gap-2 rounded-lg px-2 py-2 text-left text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              className,
            )}
            aria-label="Switch institution"
          />
        }
      >
        <Building2 className="size-4 shrink-0 opacity-80" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {selectedInstitution.shortName}
          </span>
          <span className="block truncate text-xs text-sidebar-foreground/70">
            {institutions.length > 1
              ? `${institutions.length} institutions`
              : selectedInstitution.name}
          </span>
        </span>
        <ChevronDown className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" side="top" className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Institutions</DropdownMenuLabel>
          {institutions.map((institution) => {
            const isActive = institution.id === selectedInstitution.id;
            return (
              <DropdownMenuItem
                key={institution.id}
                onClick={() => setSelectedInstitution(institution.id)}
                className="flex items-start justify-between gap-3"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium">{institution.shortName}</p>
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
          })}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            onNavigate?.();
            navigate(instructorSettingsPath("canvas"));
          }}
          className="gap-2"
        >
          <Settings2 className="size-4" aria-hidden="true" />
          Manage connections
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
