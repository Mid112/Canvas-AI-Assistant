import { AssistantAvatar } from "@/components/brand/AssistantAvatar";

export function LoadingIndicator() {
  return (
    <div
      className="flex gap-3"
      role="status"
      aria-live="polite"
      aria-label="Assistant is typing"
    >
      <AssistantAvatar size="sm" />

      <div className="flex items-center gap-1 rounded-2xl rounded-tl-md bg-muted/70 px-4 py-3">
        <span className="size-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.3s]" />
        <span className="size-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.15s]" />
        <span className="size-2 animate-bounce rounded-full bg-muted-foreground/60" />
      </div>
    </div>
  );
}
