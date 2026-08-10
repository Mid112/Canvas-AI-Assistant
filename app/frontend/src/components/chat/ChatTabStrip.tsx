import { Plus, X } from "lucide-react";

import {
  chatTabLabels,
  describeChatTabLimit,
  type ChatTab,
  type ChatTabLimit,
} from "@/lib/chat-tabs";
import { cn } from "@/lib/utils";

interface ChatTabStripProps {
  tabs: ChatTab[];
  activeTabId: string;
  /** Whether "+" can open anything, and if not, why. */
  limit: ChatTabLimit;
  onFocus: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onNew: () => void;
}

/**
 * The browser-style tab strip above the assistant chat.
 *
 * Each tab is a course, named after it, and no two tabs hold the same one.
 * Showing which course a thread belongs to — and that switching course opens a
 * different thread rather than continuing this one — is the job the
 * switch-course modal used to do in prose.
 *
 * Purely presentational: every rule about what tabs exist, which is active and
 * why "+" is unavailable lives in lib/chat-tabs.ts.
 */
export function ChatTabStrip({
  tabs,
  activeTabId,
  limit,
  onFocus,
  onClose,
  onNew,
}: ChatTabStripProps) {
  const labels = chatTabLabels(tabs);
  // The last tab has no close control at all rather than a disabled one:
  // there is always somewhere to be, and "+" is right there for a fresh start.
  const canClose = tabs.length > 1;
  const limitMessage = describeChatTabLimit(limit);
  const blocked = limitMessage !== null;

  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-border/60">
      <div
        role="tablist"
        aria-label="Chat tabs"
        className="flex min-w-0 items-end gap-1"
      >
        {tabs.map((tab) => {
          const label = labels.get(tab.id) ?? "";
          const isActive = tab.id === activeTabId;

          return (
            <div
              key={tab.id}
              role="presentation"
              className={cn(
                "flex min-w-0 items-center gap-1 rounded-t-md border border-b-0 px-2 py-1.5 transition-colors duration-200",
                isActive
                  ? "border-border/60 bg-card"
                  : "border-transparent bg-muted/40 hover:bg-muted/70",
              )}
            >
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onFocus(tab.id)}
                className={cn(
                  "min-w-0 truncate rounded-sm text-sm transition-colors duration-200",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                  // A course name is long; cap it so five tabs still fit and
                  // the strip never pushes the chat sideways.
                  "max-w-[10rem]",
                  isActive
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                title={label}
              >
                {label}
              </button>
              {canClose ? (
                <button
                  type="button"
                  aria-label={`Close ${label}`}
                  onClick={() => onClose(tab.id)}
                  className={cn(
                    "shrink-0 rounded-sm p-0.5 text-muted-foreground transition-colors duration-200",
                    "hover:bg-muted hover:text-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                  )}
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Outside the tablist: it opens a tab rather than being one, and a
          non-tab child of a tablist is not something a screen reader can
          make sense of.

          aria-disabled rather than disabled, so the button keeps its place in
          the focus order and a screen reader reaches the reason attached to
          it. A `disabled` button is skipped entirely, which is how a blocked
          "+" ends up unexplained for exactly the users who cannot see the
          note beside it. */}
      <button
        type="button"
        aria-label="New chat tab"
        aria-disabled={blocked}
        aria-describedby={blocked ? "chat-tab-limit" : undefined}
        onClick={blocked ? undefined : onNew}
        className={cn(
          "mb-1 shrink-0 rounded-md p-1 transition-colors duration-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
          blocked
            ? "cursor-not-allowed text-muted-foreground/50"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>

      {/* Shown, not just announced. A greyed-out "+" with no explanation is
          the thing this replaces: the ceiling is two different rules and
          which one you hit changes whether closing a tab would help. */}
      {limitMessage ? (
        <p
          id="chat-tab-limit"
          className="ml-auto min-w-0 truncate pl-2 text-xs text-muted-foreground"
          title={limitMessage}
        >
          {limitMessage}
        </p>
      ) : null}
    </div>
  );
}
