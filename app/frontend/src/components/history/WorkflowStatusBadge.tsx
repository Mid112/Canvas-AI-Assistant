import type { WorkflowExecutionStatus } from "@/types/actionHistory";
import { cn } from "@/lib/utils";

const statusStyles: Record<WorkflowExecutionStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-blue-100 text-blue-800",
  rejected: "bg-red-100 text-red-800",
  executed: "bg-emerald-100 text-emerald-800",
  failed: "bg-rose-100 text-rose-800",
};

const statusLabels: Record<WorkflowExecutionStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  executed: "Executed",
  failed: "Failed",
};

interface WorkflowStatusBadgeProps {
  status: WorkflowExecutionStatus;
  className?: string;
}

export function WorkflowStatusBadge({
  status,
  className,
}: WorkflowStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
        statusStyles[status],
        className,
      )}
    >
      {statusLabels[status]}
    </span>
  );
}
