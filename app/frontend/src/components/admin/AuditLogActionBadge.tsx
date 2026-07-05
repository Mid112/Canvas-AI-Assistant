import { Badge } from "@/components/ui/badge";

interface AuditLogActionBadgeProps {
  action: string;
}

export function AuditLogActionBadge({ action }: AuditLogActionBadgeProps) {
  return (
    <Badge
      variant="outline"
      className="border-border/80 bg-muted/50 font-normal text-foreground hover:bg-muted/50"
    >
      {action}
    </Badge>
  );
}
