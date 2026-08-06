import { CheckCircle2, Clock, PauseCircle, XCircle } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { WorkflowStatusCounts } from "@/types/workflowHistory";

interface WorkflowStatusSummaryProps {
  counts: WorkflowStatusCounts;
}

const statusConfig = [
  {
    key: "approved" as const,
    label: "Approved",
    icon: CheckCircle2,
    iconClass: "text-green-600",
    bgClass: "bg-green-50 dark:bg-green-950/30",
    borderClass: "border-green-200 dark:border-green-800",
  },
  {
    key: "rejected" as const,
    label: "Rejected",
    icon: XCircle,
    iconClass: "text-red-600",
    bgClass: "bg-red-50 dark:bg-red-950/30",
    borderClass: "border-red-200 dark:border-red-800",
  },
  {
    key: "pending" as const,
    label: "Pending",
    icon: Clock,
    iconClass: "text-amber-600",
    bgClass: "bg-amber-50 dark:bg-amber-950/30",
    borderClass: "border-amber-200 dark:border-amber-800",
  },
  {
    key: "paused" as const,
    label: "Paused",
    icon: PauseCircle,
    iconClass: "text-slate-600",
    bgClass: "bg-slate-50 dark:bg-slate-950/30",
    borderClass: "border-slate-200 dark:border-slate-800",
  },
];

export function WorkflowStatusSummary({ counts }: WorkflowStatusSummaryProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {statusConfig.map(
        ({ key, label, icon: Icon, iconClass, bgClass, borderClass }) => (
          <Card
            key={key}
            className={`${bgClass} ${borderClass} shadow-sm`}
          >
            <CardContent className="flex items-center gap-3 py-4">
              <Icon className={`size-6 shrink-0 ${iconClass}`} aria-hidden="true" />
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  {label}
                </p>
                <p className="text-2xl font-bold">{counts[key]}</p>
              </div>
            </CardContent>
          </Card>
        ),
      )}
    </div>
  );
}
