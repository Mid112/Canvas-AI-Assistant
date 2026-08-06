// Chat UI note: preserves the instructor's submitted wording exactly, including line breaks, for later chat-history replay.

import type { ChatMessage } from "@/types/chat";

interface UserMessageProps {
  message: ChatMessage;
}

function formatTimestamp(timestamp: Date): string {
  return timestamp.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function UserMessage({ message }: UserMessageProps) {
  return (
    <div className="flex justify-end">
      <div className="min-w-0 max-w-[85%] space-y-1 sm:max-w-[75%]">
        <div className="rounded-2xl rounded-tr-md bg-primary px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-white">
          {message.content}
        </div>
        <time
          dateTime={message.timestamp.toISOString()}
          className="block text-right text-xs text-muted-foreground"
        >
          {formatTimestamp(message.timestamp)}
        </time>
      </div>
    </div>
  );
}
