// Preview UI note: presents action type badge review details before any Canvas write is confirmed.

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DryRunActionType, DryRunHttpMethod } from "@/types/dryRunPreview";

const actionTypeStyles: Record<DryRunActionType, string> = {
  "Read Only":
    "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
  Create: "border-primary/20 bg-primary/10 text-primary hover:bg-primary/10",
  Update: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50",
  Delete:
    "border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/10",
  "Send Message":
    "border-border bg-muted text-foreground hover:bg-muted",
};

const httpMethodStyles: Record<DryRunHttpMethod, string> = {
  GET: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
  POST: "border-primary/20 bg-primary/10 text-primary hover:bg-primary/10",
  PUT: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50",
  PATCH: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50",
  DELETE:
    "border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/10",
};

interface ActionTypeBadgeProps {
  actionType: DryRunActionType;
  className?: string;
}

export function ActionTypeBadge({ actionType, className }: ActionTypeBadgeProps) {
  return (
    <Badge className={cn(actionTypeStyles[actionType], className)} variant="outline">
      {actionType}
    </Badge>
  );
}

interface ApiOperationBadgeProps {
  method: DryRunHttpMethod;
  endpoint: string;
}

export function ApiOperationBadge({ method, endpoint }: ApiOperationBadgeProps) {
  return (
    <Badge className={cn(httpMethodStyles[method])} variant="outline">
      {method} {endpoint}
    </Badge>
  );
}
