import { Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  typedDraftKindLabel,
  typedDraftPreviewText,
  type TypedDraft,
} from "@/lib/typed-draft-storage";
import type { DeferredAssistantRequest } from "@/services/assistant";

interface DraftWorkspacePanelProps {
  items: DeferredAssistantRequest[];
  typedDrafts?: TypedDraft[];
  onResume: (deferredId: number) => void;
  onDiscard: (deferredId: number) => void;
  onResumeTypedDraft?: (draftId: string) => void;
  onDiscardTypedDraft?: (draftId: string) => void;
  isResuming?: boolean;
  discardingId?: number | null;
  discardingTypedId?: string | null;
  requiresCourseSelection?: boolean;
}

function formatDeferredTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function DraftWorkspacePanel({
  items,
  typedDrafts = [],
  onResume,
  onDiscard,
  onResumeTypedDraft,
  onDiscardTypedDraft,
  isResuming = false,
  discardingId = null,
  discardingTypedId = null,
  requiresCourseSelection = false,
}: DraftWorkspacePanelProps) {
  const total = items.length + typedDrafts.length;

  return (
    <section
      aria-labelledby="draft-workspace-heading"
      className="rounded-lg border border-border/70 bg-muted/20 p-4 shadow-sm"
    >
      <h2
        id="draft-workspace-heading"
        className="text-sm font-semibold text-foreground"
      >
        Saved drafts ({total})
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Content-only drafts and chat requests saved before Canvas was ready.
        After connecting, select a course, then resume to validate, preview, and
        confirm before any Canvas write.
      </p>
      {requiresCourseSelection ? (
        <p role="status" className="mt-2 text-sm text-amber-800">
          Select an active course before resuming a typed draft.
        </p>
      ) : null}

      <ul className="mt-3 space-y-2">
        {typedDrafts.map((draft) => {
          const isDiscarding = discardingTypedId === draft.id;
          return (
            <li
              key={`typed-${draft.id}`}
              className="flex flex-col gap-3 rounded-lg border border-border/70 bg-background px-3 py-3 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">
                  {typedDraftKindLabel(draft.kind)} · Saved{" "}
                  {formatDeferredTime(draft.savedAt)}
                </p>
                <p className="mt-1 line-clamp-3 text-sm text-foreground">
                  {typedDraftPreviewText(draft)}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    isResuming ||
                    isDiscarding ||
                    requiresCourseSelection ||
                    !onResumeTypedDraft
                  }
                  onClick={() => onResumeTypedDraft?.(draft.id)}
                >
                  Resume
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isResuming || isDiscarding || !onDiscardTypedDraft}
                  onClick={() => onDiscardTypedDraft?.(draft.id)}
                >
                  {isDiscarding ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      Discarding…
                    </>
                  ) : (
                    <>
                      <Trash2 className="size-4" aria-hidden="true" />
                      Discard
                    </>
                  )}
                </Button>
              </div>
            </li>
          );
        })}

        {items.map((item) => {
          const isDiscarding = discardingId === item.id;

          return (
            <li
              key={item.id}
              className="flex flex-col gap-3 rounded-lg border border-border/70 bg-background px-3 py-3 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">
                  Chat request · Saved {formatDeferredTime(item.created_at)}
                </p>
                <p className="mt-1 line-clamp-3 text-sm text-foreground">
                  {item.message}
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={isResuming || isDiscarding}
                  onClick={() => onResume(item.id)}
                >
                  {isResuming ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      Preparing…
                    </>
                  ) : (
                    "Resume"
                  )}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isResuming || isDiscarding}
                  onClick={() => onDiscard(item.id)}
                >
                  {isDiscarding ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      Discarding…
                    </>
                  ) : (
                    <>
                      <Trash2 className="size-4" aria-hidden="true" />
                      Discard
                    </>
                  )}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
