import { cn } from "@/lib/utils";
import type { WorkflowStatus } from "@/types/workflowHistory";

interface WorkflowStatusBadgeProps {
  status: WorkflowStatus;
}

const badgeStyles: Record<WorkflowStatus, string> = {
  approved:
    "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  pending:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  paused:
    "bg-slate-100 text-slate-800 dark:bg-slate-900/40 dark:text-slate-300",
};

const labels: Record<WorkflowStatus, string> = {
  approved: "Approved",
  rejected: "Rejected",
  pending: "Pending",
  paused: "Paused",
};

export function WorkflowStatusBadge({ status }: WorkflowStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        badgeStyles[status],
      )}
    >
      {labels[status]}
    </span>
  );
}
