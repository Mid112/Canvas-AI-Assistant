// Chat UI note: keeps confirm/cancel/modify controls tied to one pending Workflow so stale proposals cannot be approved accidentally.

import { useState } from "react";
import { Ban, CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { PendingActionStatus, RiskMetadata } from "@/types/chat";

/** Visual treatment for each settled (non-pending, non-paused) status —
 * "executing" still reads as active/in-progress, "confirmed" fades into a
 * resolved state instead of keeping the same weight as an open action, and
 * "failed" gets a stable, distinct error state so it doesn't blend in with
 * (or keep competing for attention with) the AI's final response above it. */
const TERMINAL_STATUS_CONFIG: Record<
  Exclude<PendingActionStatus, "pending" | "paused">,
  {
    icon: typeof CheckCircle2;
    text: string;
    role: "status" | "alert";
    className: string;
    iconClassName: string;
  }
> = {
  executing: {
    icon: Loader2,
    text: "This action is currently running.",
    role: "status",
    // Blue, not primary/destructive — this app's --primary token is the same
    // brand red as --destructive (see TroubleshootingPage.tsx), which would
    // make an in-progress action look like an error at a glance.
    className: "border-blue-500/40 bg-blue-500/5 text-foreground",
    iconClassName: "animate-spin text-blue-600",
  },
  confirmed: {
    icon: CheckCircle2,
    text: "This action was confirmed.",
    role: "status",
    className: "border-transparent bg-transparent text-muted-foreground",
    iconClassName: "text-emerald-600",
  },
  superseded: {
    icon: RefreshCw,
    text: "This proposal was replaced by a newer request.",
    role: "status",
    className: "border-transparent bg-transparent text-muted-foreground",
    iconClassName: "text-muted-foreground",
  },
  failed: {
    icon: XCircle,
    text: "This action failed to complete — nothing was changed.",
    role: "alert",
    className: "border-destructive/30 bg-destructive/5 text-destructive",
    iconClassName: "text-destructive",
  },
  cancelled: {
    icon: Ban,
    text: "This action was cancelled.",
    role: "status",
    className: "border-transparent bg-transparent text-muted-foreground",
    iconClassName: "text-muted-foreground",
  },
};

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
    const { icon: Icon, text, role, className, iconClassName } =
      TERMINAL_STATUS_CONFIG[status];

    return (
      <div
        role={role}
        className={cn(
          "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
          className,
        )}
      >
        <Icon className={cn("size-4 shrink-0", iconClassName)} aria-hidden="true" />
        <span>{text}</span>
      </div>
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
          {isLoading ? "Executing Canvas action…" : "Confirm"}
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
