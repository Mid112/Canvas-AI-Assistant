import { getInitials } from "@/lib/user-display";
import { cn } from "@/lib/utils";
import type { SubmissionStudent } from "@/types/submission";

interface SubmissionStudentCellProps {
  student: SubmissionStudent;
}

export function SubmissionStudentCell({ student }: SubmissionStudentCellProps) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white",
          student.avatarColor,
        )}
        aria-hidden="true"
      >
        {getInitials(student.name)}
      </div>
      <span className="font-medium">{student.name}</span>
    </div>
  );
}
