import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PendingActionStatus, RiskMetadata } from "@/types/chat";

interface PendingActionControlsProps {
  status?: PendingActionStatus;
  isLoading?: boolean;
  error?: string | null;
  risk?: RiskMetadata;
  onConfirm: () => void;
  onCancel: () => void;
  onModify?: () => void;
}

export function PendingActionControls({
  status = "pending",
  isLoading = false,
  error,
  risk,
  onConfirm,
  onCancel,
  onModify,
}: PendingActionControlsProps) {
  const [confirmationText, setConfirmationText] = useState("");
  if (status !== "pending") {
    return (
      <p className="text-sm text-muted-foreground">
        {status === "confirmed"
          ? "This action was confirmed."
          : status === "executing"
            ? "This action is currently running."
          : status === "superseded"
            ? "This proposal was replaced by a newer request."
            : status === "failed"
              ? "This action failed to complete — nothing was changed."
              : "This action was cancelled."}
      </p>
    );
  }

  const requirement = risk?.confirmation_requirement;
  const requiresStrongConfirmation = requirement?.type === "strong";
  const confirmationPhrase = requirement?.confirmation_phrase ?? "CONFIRM";
  // This is a UI guard on top of the backend workflow gate: the server
  // still only executes the stored pending action by pending_message_id.
  const canConfirm =
    !requiresStrongConfirmation || confirmationText.trim() === confirmationPhrase;

  return (
    <div className="space-y-2 rounded-lg border border-border/70 bg-background px-3 py-3">
      <p className="text-sm font-medium">
        {requiresStrongConfirmation
          ? "High-risk action requires confirmation"
          : "Approve this proposed action?"}
      </p>
      <p className="text-xs text-muted-foreground">
        {requirement?.description ??
          "Confirm to send as-is, or edit the request in chat before confirming."}
      </p>
      {requiresStrongConfirmation ? (
        <div className="space-y-1">
          <Input
            aria-label={`Type ${confirmationPhrase} to confirm`}
            value={confirmationText}
            onChange={(event) => setConfirmationText(event.target.value)}
            placeholder={confirmationPhrase}
            disabled={isLoading}
          />
          <p className="text-xs text-muted-foreground">
            Type {confirmationPhrase} to enable confirmation.
          </p>
        </div>
      ) : null}
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
          disabled={isLoading || !canConfirm}
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
