import { Plus, X } from "lucide-react";

import { chatTabLabels, type ChatTab } from "@/lib/chat-tabs";
import { cn } from "@/lib/utils";

interface ChatTabStripProps {
  tabs: ChatTab[];
  activeTabId: string;
  onFocus: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onNew: () => void;
}

/**
 * The browser-style tab strip above the assistant chat.
 *
 * Each tab is a conversation bound to a course, named after it. Showing which
 * course a thread belongs to — and that switching course opens a different
 * thread rather than continuing this one — is the job the switch-course modal
 * used to do in prose.
 *
 * Purely presentational: every rule about what tabs exist, which is active and
 * what closing does lives in lib/chat-tabs.ts.
 */
export function ChatTabStrip({
  tabs,
  activeTabId,
  onFocus,
  onClose,
  onNew,
}: ChatTabStripProps) {
  const labels = chatTabLabels(tabs);
  // The last tab has no close control at all rather than a disabled one:
  // there is always somewhere to be, and "+" is right there for a fresh start.
  const canClose = tabs.length > 1;

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
                  // A course name is long; cap it so three tabs still fit and
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
          make sense of. Never disabled at the cap -- opening the fourth tab
          retires the oldest instead of refusing (see openChatTab). */}
      <button
        type="button"
        aria-label="New chat tab"
        onClick={onNew}
        className={cn(
          "mb-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors duration-200",
          "hover:bg-muted hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
        )}
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
