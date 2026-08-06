// Messages UI note: supports the instructor message-drafting flow for message thread view without bypassing preview/confirmation.

import { MessageReplyComposer } from "@/components/messages/MessageReplyComposer";
import type { MessageReplyPreviewSummary } from "@/components/messages/MessageReplyComposer";
import { formatAuditTimestamp } from "@/lib/format-audit-timestamp";
import { cn } from "@/lib/utils";
import type { MessageThread } from "@/types/messageThread";

interface MessageThreadViewProps {
  thread: MessageThread;
  onReply: (body: string) => Promise<void>;
  onGenerateDraft?: () => Promise<string>;
  onPreview?: (body: string) => Promise<MessageReplyPreviewSummary>;
}

export function MessageThreadView({
  thread,
  onReply,
  onGenerateDraft,
  onPreview,
}: MessageThreadViewProps) {
  return (
    <div className="space-y-6 rounded-xl border bg-card p-4 md:p-5">
      <header className="space-y-1 border-b border-border/60 pb-4">
        <h2 className="text-lg font-semibold tracking-tight">{thread.subject}</h2>
        <p className="text-sm text-muted-foreground">
          {thread.courseName} ·{" "}
          {thread.participants
            .filter((participant) => participant.role === "student")
            .map((participant) => participant.name)
            .join(", ") || "No student recipients"}
        </p>
      </header>

      <section aria-label="Conversation" className="space-y-3">
        <h3 className="text-sm font-semibold">Conversation</h3>
        <ul className="space-y-3">
          {thread.messages.map((message) => {
            const isInstructor = message.author.role === "instructor";
            return (
              <li
                key={message.id}
                className={cn(
                  "rounded-lg px-3 py-3",
                  isInstructor
                    ? "border border-primary/20 bg-primary/5"
                    : "border border-border/70 bg-muted/30",
                )}
              >
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {message.author.name}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {isInstructor ? "Instructor" : "Student"}
                    </span>
                  </p>
                  <time
                    dateTime={message.sentAt}
                    className="text-xs text-muted-foreground"
                  >
                    {formatAuditTimestamp(message.sentAt)}
                  </time>
                </div>
                <p className="whitespace-pre-wrap text-sm">{message.body}</p>
              </li>
            );
          })}
        </ul>
      </section>

      <MessageReplyComposer
        onSend={onReply}
        onGenerateDraft={onGenerateDraft}
        onPreview={onPreview}
      />
    </div>
  );
}
