import { formatAuditTimestamp } from "@/lib/format-audit-timestamp";
import { getStudentReplies } from "@/services/messageThreads";
import type { MessageThread } from "@/types/messageThread";

interface StudentRepliesSectionProps {
  thread: MessageThread;
}

export function StudentRepliesSection({ thread }: StudentRepliesSectionProps) {
  const replies = getStudentReplies(thread);

  return (
    <section aria-label="Student replies" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Student replies</h3>
        <span className="text-xs text-muted-foreground">
          {replies.length === 0
            ? "No replies yet"
            : `${replies.length} ${replies.length === 1 ? "reply" : "replies"}`}
        </span>
      </div>

      {replies.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
          Students have not replied to this message yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {replies.map((reply) => (
            <li
              key={reply.id}
              className="rounded-lg border border-border/70 bg-muted/30 px-3 py-3"
            >
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">{reply.author.name}</p>
                <time
                  dateTime={reply.sentAt}
                  className="text-xs text-muted-foreground"
                >
                  {formatAuditTimestamp(reply.sentAt)}
                </time>
              </div>
              <p className="whitespace-pre-wrap text-sm text-foreground">
                {reply.body}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
