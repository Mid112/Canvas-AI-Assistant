import { AlertTriangle } from "lucide-react";

import { AssistantAvatar } from "@/components/brand/AssistantAvatar";

import { ActionCard } from "@/components/chat/ActionCard";
import { ExplanationCard } from "@/components/chat/ExplanationCard";
import { PendingActionControls } from "@/components/chat/PendingActionControls";
import type { ChatMessage } from "@/types/chat";

interface AssistantMessageProps {
  message: ChatMessage;
  isResolvingPendingAction?: boolean;
  pendingActionError?: string | null;
  onConfirmPendingAction?: () => void;
  onCancelPendingAction?: () => void;
  onModifyPendingAction?: () => void;
}

function formatTimestamp(timestamp: Date): string {
  return timestamp.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function AssistantMessage({
  message,
  isResolvingPendingAction = false,
  pendingActionError = null,
  onConfirmPendingAction,
  onCancelPendingAction,
  onModifyPendingAction,
}: AssistantMessageProps) {
  const showPendingControls =
    message.pendingMessageId !== undefined && message.pendingActionStatus;

  return (
    <div className="flex gap-3">
      <AssistantAvatar size="sm" />

      <div className="min-w-0 max-w-[85%] space-y-2 sm:max-w-[75%]">
        <div className="rounded-2xl rounded-tl-md bg-muted/70 px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>

        {message.acknowledgedFields &&
        message.acknowledgedFields.length > 0 ? (
          <div className="rounded-lg border border-border/70 bg-background px-3 py-2.5">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Already provided
            </p>
            <dl className="grid gap-1.5 text-sm sm:grid-cols-2">
              {message.acknowledgedFields.map((field) => (
                <div key={field.label}>
                  <dt className="text-xs text-muted-foreground">{field.label}</dt>
                  <dd className="font-medium">{field.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}

        {message.safetyBlocked && message.safetyMessage ? (
          <div
            role="alert"
            className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-950"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>{message.safetyMessage}</p>
          </div>
        ) : null}

        {message.explanation ? (
          <ExplanationCard explanation={message.explanation} />
        ) : null}

        {message.interpretedAction ? (
          <ActionCard action={message.interpretedAction} />
        ) : null}

        {showPendingControls ? (
          <PendingActionControls
            status={message.pendingActionStatus}
            risk={message.interpretedAction?.risk}
            isLoading={isResolvingPendingAction}
            error={pendingActionError}
            onConfirm={
              message.pendingActionStatus === "pending"
                ? onConfirmPendingAction!
                : () => {}
            }
            onCancel={
              message.pendingActionStatus === "pending"
                ? onCancelPendingAction!
                : () => {}
            }
            onModify={
              message.pendingActionStatus === "pending"
                ? onModifyPendingAction
                : undefined
            }
          />
        ) : null}

        <time
          dateTime={message.timestamp.toISOString()}
          className="block text-xs text-muted-foreground"
        >
          {formatTimestamp(message.timestamp)}
        </time>
      </div>
    </div>
  );
}
