import { Button } from "@/components/ui/button";
import type { PendingActionStatus } from "@/types/chat";

interface PendingActionControlsProps {
  status?: PendingActionStatus;
  isLoading?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  onModify?: () => void;
}

export function PendingActionControls({
  status = "pending",
  isLoading = false,
  error,
  onConfirm,
  onCancel,
  onModify,
}: PendingActionControlsProps) {
  if (status !== "pending") {
    return (
      <p className="text-sm text-muted-foreground">
        {status === "confirmed"
          ? "This action was confirmed."
          : status === "superseded"
            ? "This proposal was replaced by a newer request."
            : "This action was cancelled."}
      </p>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-border/70 bg-background px-3 py-3">
      <p className="text-sm font-medium">Approve this proposed action?</p>
      <p className="text-xs text-muted-foreground">
        Confirm to send as-is, or edit the request in chat before confirming.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          onClick={onConfirm}
          disabled={isLoading}
        >
          {isLoading ? "Confirming..." : "Confirm"}
        </Button>
        {onModify ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={onModify}
            disabled={isLoading}
          >
            Edit before sending
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onCancel}
          disabled={isLoading}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
