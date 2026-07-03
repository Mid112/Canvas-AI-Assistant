import { CheckCircle2, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { AuditLogResult } from "@/types/auditLog";

const resultConfig: Record<
  AuditLogResult,
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  success: {
    label: "Success",
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
    Icon: CheckCircle2,
  },
  failed: {
    label: "Failed",
    className:
      "border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/10",
    Icon: XCircle,
  },
};

interface AuditLogResultBadgeProps {
  result: AuditLogResult;
}

export function AuditLogResultBadge({ result }: AuditLogResultBadgeProps) {
  const config = resultConfig[result];
  const Icon = config.Icon;

  return (
    <Badge className={config.className} variant="outline">
      <Icon className="size-3" aria-hidden="true" />
      {config.label}
    </Badge>
  );
}
