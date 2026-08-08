import { AssistantAvatar } from "@/components/brand/AssistantAvatar";

interface LoadingIndicatorProps {
  /** Visible stage copy shown next to the bouncing dots. */
  label?: string;
  /** Optional troubleshooting note; resolves when loading ends. */
  note?: string | null;
}

export function LoadingIndicator({
  label = "Thinking…",
  note = null,
}: LoadingIndicatorProps) {
  return (
    <div
      className="flex gap-3"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <AssistantAvatar size="sm" />

      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2 rounded-2xl rounded-tl-md bg-muted/70 px-4 py-3">
          <span className="size-2 shrink-0 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.3s]" />
          <span className="size-2 shrink-0 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.15s]" />
          <span className="size-2 shrink-0 animate-bounce rounded-full bg-muted-foreground/60" />
          <span className="ml-1 text-sm text-muted-foreground">{label}</span>
        </div>

        {note ? (
          <p className="animate-in fade-in-0 px-1 text-xs text-muted-foreground duration-300">
            {note}
          </p>
        ) : null}
      </div>
    </div>
  );
}
