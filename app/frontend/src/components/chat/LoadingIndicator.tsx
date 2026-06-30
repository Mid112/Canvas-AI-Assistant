import { Bot } from "lucide-react";

export function LoadingIndicator() {
  return (
    <div
      className="flex gap-3"
      role="status"
      aria-live="polite"
      aria-label="Assistant is typing"
    >
      <div
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600"
        aria-hidden="true"
      >
        <Bot className="size-4" />
      </div>

      <div className="flex items-center gap-1 rounded-2xl rounded-tl-md bg-muted/70 px-4 py-3">
        <span className="size-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.3s]" />
        <span className="size-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.15s]" />
        <span className="size-2 animate-bounce rounded-full bg-muted-foreground/60" />
      </div>
    </div>
  );
}
