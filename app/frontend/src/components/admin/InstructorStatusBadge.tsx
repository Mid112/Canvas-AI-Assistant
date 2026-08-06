// Admin UI note: presents instructor status badge controls for institution/admin workflows with service-backed state.

import { CheckCircle2, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { InstructorStatus } from "@/types/instructor";

const statusConfig: Record<
  InstructorStatus,
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  active: {
    label: "Active",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
    Icon: CheckCircle2,
  },
  disabled: {
    label: "Disabled",
    className: "border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/10",
    Icon: XCircle,
  },
};

interface InstructorStatusBadgeProps {
  status: InstructorStatus;
}

export function InstructorStatusBadge({ status }: InstructorStatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.Icon;

  return (
    <Badge className={config.className} variant="outline">
      <Icon className="size-3" aria-hidden="true" />
      {config.label}
    </Badge>
  );
}
