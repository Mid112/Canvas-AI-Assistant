// Preview UI note: presents preview actions review details before any Canvas write is confirmed.

import { Check, Pencil, X } from "lucide-react";

import { Button } from "@/components/ui/button";

interface PreviewActionsProps {
  isConfirming?: boolean;
  confirmError?: string | null;
  onReject: () => void;
  onModify: () => void;
  onConfirm: () => void;
}

export function PreviewActions({
  isConfirming = false,
  confirmError,
  onReject,
  onModify,
  onConfirm,
}: PreviewActionsProps) {
  return (
    <div className="space-y-4">
      {confirmError ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-center text-sm text-destructive"
        >
          {confirmError}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={onReject}
          disabled={isConfirming}
          className="border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive"
        >
          <X className="size-4" aria-hidden="true" />
          Reject
        </Button>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={onModify}
            disabled={isConfirming}
            className="border-primary/30 text-primary hover:bg-primary/5 hover:text-primary"
          >
            <Pencil className="size-4" aria-hidden="true" />
            Modify Request
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={isConfirming}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Check className="size-4" aria-hidden="true" />
            {isConfirming ? "Approving..." : "Approve & Execute"}
          </Button>
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        All actions are logged for audit purposes.
      </p>
    </div>
  );
}
