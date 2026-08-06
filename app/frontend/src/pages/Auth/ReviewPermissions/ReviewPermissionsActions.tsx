import { Check, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ReviewPermissionsActionsProps {
  onReconnect: () => void;
  onApprove: () => void;
}

export function ReviewPermissionsActions({
  onReconnect,
  onApprove,
}: ReviewPermissionsActionsProps) {
  return (
    <div className="flex gap-3">
      <Button
        type="button"
        variant="outline"
        onClick={onReconnect}
        className="h-11 flex-1 rounded-lg border-border bg-card text-base font-semibold text-muted-foreground hover:bg-muted"
      >
        <RefreshCw className="size-4" aria-hidden="true" />
        Reconnect Canvas
      </Button>
      <Button
        type="button"
        onClick={onApprove}
        className="h-11 flex-1 rounded-lg bg-primary text-base font-semibold text-primary-foreground shadow-sm shadow-primary/20 hover:bg-primary/90"
      >
        <Check className="size-4" aria-hidden="true" />
        Approve &amp; Continue
      </Button>
    </div>
  );
}
