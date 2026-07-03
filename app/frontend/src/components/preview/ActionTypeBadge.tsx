import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DryRunActionType, DryRunHttpMethod } from "@/types/dryRunPreview";

const actionTypeStyles: Record<DryRunActionType, string> = {
  "Read Only":
    "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
  Create: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50",
  Update: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50",
  Delete:
    "border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/10",
  "Send Message":
    "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-50",
};

const httpMethodStyles: Record<DryRunHttpMethod, string> = {
  GET: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
  POST: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50",
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
