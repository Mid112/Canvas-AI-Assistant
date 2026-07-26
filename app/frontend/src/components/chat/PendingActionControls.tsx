import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PendingActionStatus, RiskMetadata } from "@/types/chat";

interface PendingActionControlsProps {
  status?: PendingActionStatus;
  isLoading?: boolean;
  risk?: RiskMetadata;
  displayName?: string | null;
  confirmBlockedReason?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  onModify?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onRename?: (displayName: string) => void;
}

export function PendingActionControls({
  status = "pending",
  isLoading = false,
  risk,
  displayName = null,
  confirmBlockedReason = null,
  onConfirm,
  onCancel,
  onModify,
  onPause,
  onResume,
  onRename,
}: PendingActionControlsProps) {
  const [confirmationText, setConfirmationText] = useState("");
  const [renameValue, setRenameValue] = useState(displayName ?? "");
  const [isRenaming, setIsRenaming] = useState(false);

  if (status === "paused") {
    return (
      <div className="space-y-2 rounded-lg border border-border/70 bg-background px-3 py-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Actions
        </div>
        <p className="text-sm font-medium">
          {displayName ? `“${displayName}” is paused.` : "This workflow is paused."}
        </p>
        <p className="text-xs text-muted-foreground">
          Resume to continue reviewing this proposal. Cancel is available after
          resume — the server rejects cancel while paused.
        </p>
        {onRename ? (
          <div className="flex flex-wrap gap-2">
            <Input
              aria-label="Workflow name"
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              placeholder="Name this workflow"
              disabled={isLoading}
              className="max-w-xs"
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={isLoading || !renameValue.trim()}
              onClick={() => onRename(renameValue.trim())}
            >
              Save name
            </Button>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={onResume}
            disabled={isLoading || !onResume}
          >
            {isLoading ? "Resuming..." : "Resume"}
          </Button>
        </div>
      </div>
    );
  }

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
  if (
    risk?.requires_confirmation === false ||
    requirement?.type === "none"
  ) {
    return (
      <div className="rounded-lg border border-border/70 bg-background px-3 py-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Actions
        </div>
        <p className="text-sm font-medium">Read-only action. No confirmation required.</p>
      </div>
    );
  }

  const requiresStrongConfirmation = requirement?.type === "strong";
  const confirmationPhrase = requirement?.confirmation_phrase ?? "CONFIRM";
  // This is a UI guard on top of the backend workflow gate: the server
  // still only executes the stored pending action by pending_message_id.
  const canConfirm =
    !confirmBlockedReason &&
    (!requiresStrongConfirmation || confirmationText.trim() === confirmationPhrase);

  return (
    <div className="space-y-2 rounded-lg border border-border/70 bg-background px-3 py-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Actions
      </div>
      {displayName ? (
        <p className="text-xs text-muted-foreground">Workflow: {displayName}</p>
      ) : null}
      <p className="text-sm font-medium">
        {requiresStrongConfirmation
          ? "High-risk action requires confirmation"
          : "Approve this proposed action?"}
      </p>
      <p className="text-xs text-muted-foreground">
        {requirement?.description ??
          "Confirm to send as-is, or edit the request in chat before confirming."}
      </p>
      {confirmBlockedReason ? (
        <p role="status" className="text-xs text-amber-800">
          {confirmBlockedReason}
        </p>
      ) : null}
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
      {onRename ? (
        <div className="space-y-1">
          {isRenaming ? (
            <div className="flex flex-wrap gap-2">
              <Input
                aria-label="Workflow name"
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                placeholder="Name this workflow"
                disabled={isLoading}
                className="max-w-xs"
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={isLoading || !renameValue.trim()}
                onClick={() => {
                  onRename(renameValue.trim());
                  setIsRenaming(false);
                }}
              >
                Save name
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={isLoading}
                onClick={() => setIsRenaming(false)}
              >
                Close
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={isLoading}
              onClick={() => setIsRenaming(true)}
            >
              Rename workflow
            </Button>
          )}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          onClick={onConfirm}
          disabled={isLoading || !canConfirm}
        >
          {isLoading ? "Updating..." : "Confirm"}
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
        {onPause ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={onPause}
            disabled={isLoading}
          >
            Pause
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
