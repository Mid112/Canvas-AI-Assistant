import { formatAuditTimestamp } from "@/lib/format-audit-timestamp";
import { cn } from "@/lib/utils";
import type { MessageThread } from "@/types/messageThread";

interface MessageInboxListProps {
  threads: MessageThread[];
  selectedThreadId: string | null;
  onSelectThread: (threadId: string) => void;
}

export function MessageInboxList({
  threads,
  selectedThreadId,
  onSelectThread,
}: MessageInboxListProps) {
  if (threads.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        No messages yet. Compose a message to start a conversation.
      </div>
    );
  }

  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card">
      {threads.map((thread) => {
        const isSelected = thread.id === selectedThreadId;
        return (
          <li key={thread.id}>
            <button
              type="button"
              onClick={() => onSelectThread(thread.id)}
              className={cn(
                "flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-muted/50",
                isSelected && "bg-primary/5",
              )}
              aria-current={isSelected ? "true" : undefined}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="truncate text-sm font-medium">{thread.subject}</p>
                {thread.unreadCount > 0 ? (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                    {thread.unreadCount}
                  </span>
                ) : null}
              </div>
              <p className="truncate text-sm text-muted-foreground">
                {thread.preview}
              </p>
              <p className="text-xs text-muted-foreground">
                {thread.courseName} · {formatAuditTimestamp(thread.updatedAt)}
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
