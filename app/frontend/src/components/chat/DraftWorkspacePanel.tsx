import { ChevronDown, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  typedDraftKindLabel,
  typedDraftPreviewText,
  type TypedDraft,
} from "@/lib/typed-draft-storage";
import { cn } from "@/lib/utils";
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
  /** Typed drafts whose course could not be resolved, so resuming them has
   * nowhere to land. Per draft rather than a single flag: a list can hold a
   * self-describing draft and a legacy one at the same time, and only the
   * legacy one is blocked. */
  blockedTypedDraftIds?: ReadonlySet<string>;
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
  blockedTypedDraftIds,
}: DraftWorkspacePanelProps) {
  const total = items.length + typedDrafts.length;
  const blockedIds = blockedTypedDraftIds ?? new Set<string>();
  const hasBlockedDrafts = typedDrafts.some((draft) => blockedIds.has(draft.id));
  // Collapsed by default so the chat window stays the primary surface —
  // the count stays visible in the header either way (#1, #10).
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <section
      aria-labelledby="draft-workspace-heading"
      className="shrink-0 rounded-lg border border-border/70 bg-muted/20 px-4 py-3 shadow-sm"
    >
      <button
        type="button"
        onClick={() => setIsExpanded((current) => !current)}
        aria-expanded={isExpanded}
        aria-controls="draft-workspace-content"
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <h2
          id="draft-workspace-heading"
          className="text-sm font-semibold text-foreground"
        >
          Saved drafts ({total})
        </h2>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            isExpanded && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      {isExpanded ? (
        <div id="draft-workspace-content">
          <p className="mt-1 text-sm text-muted-foreground">
            Content-only drafts and chat requests saved before Canvas was ready.
            After connecting, select a course, then resume to validate, preview,
            and confirm before any Canvas write.
          </p>
          {/* Worded for a mixed list: drafts that name their own course stay
              resumable alongside ones that don't, so this can't claim every
              draft needs a selection. */}
          {hasBlockedDrafts ? (
            <p role="status" className="mt-2 text-sm text-amber-800">
              Select an active course to resume drafts that don&apos;t name
              their own.
            </p>
          ) : null}

          {/* Bounded and independently scrollable — an unbounded list here
              (#10) grows with every saved draft/deferred request, eating into
              the chat window's shared vertical budget until the message input
              gets clipped off entirely. */}
          <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
            {typedDrafts.map((draft) => {
              const isDiscarding = discardingTypedId === draft.id;
              const isBlocked = blockedIds.has(draft.id);
              const blockedReasonId = `typed-draft-blocked-${draft.id}`;
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
                    {/* Says why this one specifically can't be resumed. Without
                        it a disabled button in a list where its neighbours are
                        enabled reads as a glitch. */}
                    {isBlocked ? (
                      <p
                        id={blockedReasonId}
                        className="mt-1 text-xs text-amber-800"
                      >
                        This draft has no saved course. Select an active course
                        to resume it.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={
                        isResuming ||
                        isDiscarding ||
                        isBlocked ||
                        !onResumeTypedDraft
                      }
                      aria-describedby={isBlocked ? blockedReasonId : undefined}
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
        </div>
      ) : null}
    </section>
  );
}
