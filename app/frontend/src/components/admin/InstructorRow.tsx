// Admin UI note: presents instructor row controls for institution/admin workflows with service-backed state.

import { ActionMenu } from "@/components/admin/ActionMenu";
import { InstructorStatusBadge } from "@/components/admin/InstructorStatusBadge";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  formatCreatedDate,
  formatRelativeTime,
} from "@/lib/format-relative-time";
import { getInitials } from "@/lib/user-display";
import { getInstructorFullName, type Instructor } from "@/types/instructor";

interface InstructorRowProps {
  instructor: Instructor;
  onEdit: (instructor: Instructor) => void;
  onEnable: (instructor: Instructor) => void;
  onDisable: (instructor: Instructor) => void;
  onRevoke: (instructor: Instructor) => void;
  onManageCanvasConnections: (instructor: Instructor) => void;
}

export function InstructorRow({
  instructor,
  onEdit,
  onEnable,
  onDisable,
  onRevoke,
  onManageCanvasConnections,
}: InstructorRowProps) {
  const fullName = getInstructorFullName(instructor);

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {getInitials(fullName)}
          </span>
          <span className="font-medium">{fullName}</span>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">{instructor.email}</TableCell>
      <TableCell>
        <InstructorStatusBadge status={instructor.status} />
      </TableCell>
      <TableCell className="text-muted-foreground">
        {formatCreatedDate(instructor.createdAt)}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {formatRelativeTime(instructor.lastLoginAt)}
      </TableCell>
      <TableCell className="text-right">
        <ActionMenu
          instructor={instructor}
          onEdit={onEdit}
          onEnable={onEnable}
          onDisable={onDisable}
          onRevoke={onRevoke}
          onManageCanvasConnections={onManageCanvasConnections}
        />
      </TableCell>
    </TableRow>
  );
}
