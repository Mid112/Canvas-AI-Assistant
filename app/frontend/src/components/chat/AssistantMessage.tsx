import { AlertTriangle, Bot } from "lucide-react";

import { ActionCard } from "@/components/chat/ActionCard";
import { ExplanationCard } from "@/components/chat/ExplanationCard";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/types/chat";

interface AssistantMessageProps {
  message: ChatMessage;
}

function formatTimestamp(timestamp: Date): string {
  return timestamp.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function AssistantMessage({ message }: AssistantMessageProps) {
  return (
    <div className="flex gap-3">
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          "bg-blue-100 text-blue-600",
        )}
        aria-hidden="true"
      >
        <Bot className="size-4" />
      </div>

      <div className="min-w-0 max-w-[85%] space-y-2 sm:max-w-[75%]">
        <div className="rounded-2xl rounded-tl-md bg-muted/70 px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>

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
