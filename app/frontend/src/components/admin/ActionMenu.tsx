import { Ban, MoreHorizontal, Pencil, Trash2, UserCheck, Wifi } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Instructor } from "@/types/instructor";
import { getInstructorFullName } from "@/types/instructor";

interface ActionMenuProps {
  instructor: Instructor;
  onEdit: (instructor: Instructor) => void;
  onEnable: (instructor: Instructor) => void;
  onDisable: (instructor: Instructor) => void;
  onRevoke: (instructor: Instructor) => void;
  onManageCanvasConnections: (instructor: Instructor) => void;
}

export function ActionMenu({
  instructor,
  onEdit,
  onEnable,
  onDisable,
  onRevoke,
  onManageCanvasConnections,
}: ActionMenuProps) {
  const fullName = getInstructorFullName(instructor);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for ${fullName}`}
          />
        }
      >
        <MoreHorizontal className="size-4" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={() => onEdit(instructor)}>
          <Pencil className="size-4" aria-hidden="true" />
          Edit
        </DropdownMenuItem>
        {instructor.status === "disabled" ? (
          <DropdownMenuItem onClick={() => onEnable(instructor)}>
            <UserCheck className="size-4" aria-hidden="true" />
            Enable
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => onDisable(instructor)}>
            <Ban className="size-4" aria-hidden="true" />
            Disable
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => onManageCanvasConnections(instructor)}>
          <Wifi className="size-4" aria-hidden="true" />
          Canvas connections
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onClick={() => onRevoke(instructor)}
        >
          <Trash2 className="size-4" aria-hidden="true" />
          Revoke Access
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
