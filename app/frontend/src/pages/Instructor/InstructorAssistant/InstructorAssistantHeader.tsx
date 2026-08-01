import {
  BarChart3,
  ChevronDown,
  ClipboardList,
  MessageSquare,
} from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";
import {
  dashboardColors,
  dashboardInteractive,
} from "@/pages/Instructor/InstructorDashboard/dashboardColors";
import type { SuggestedAction } from "@/types/chat";

const actionIcons = {
  "missing-submissions": ClipboardList,
  "late-assignments": ClipboardList,
  "course-performance": BarChart3,
  "draft-student-message": MessageSquare,
} as const;

interface InstructorAssistantSuggestedActionsProps {
  actions: SuggestedAction[];
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}

export function InstructorAssistantSuggestedActions({
  actions,
  onSelect,
  disabled = false,
}: InstructorAssistantSuggestedActionsProps) {
  // Collapsed by default so the chat window stays the primary surface —
  // expanding reveals the full action grid (#1).
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <section aria-label="Suggested actions" className="shrink-0 space-y-2.5">
      <button
        type="button"
        onClick={() => setIsExpanded((current) => !current)}
        aria-expanded={isExpanded}
        aria-controls="suggested-actions-content"
        className="group flex w-full items-center justify-between gap-3 rounded-lg border border-border/80 bg-card px-3 py-2.5 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="h-5 w-1 rounded-full bg-primary" aria-hidden="true" />
          <h2 className="truncate text-sm font-semibold text-foreground">
            Suggested actions
          </h2>
        </span>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-hover:bg-background group-hover:text-foreground">
          <ChevronDown
            className={cn(
              "size-4 transition-transform",
              isExpanded && "rotate-180",
            )}
            aria-hidden="true"
          />
        </span>
      </button>

      {isExpanded ? (
        <div id="suggested-actions-content" className="grid gap-2 sm:grid-cols-2">
          {actions.map((action) => {
            const Icon =
              actionIcons[action.id as keyof typeof actionIcons] ?? ClipboardList;

            return (
              <button
                key={action.id}
                type="button"
                disabled={disabled}
                onClick={() => onSelect(action.prompt)}
                className={cn(
                  dashboardInteractive.actionCard,
                  disabled && "cursor-not-allowed opacity-60",
                )}
              >
                <div
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center",
                    dashboardColors.red.iconSquare,
                    dashboardInteractive.actionIcon,
                  )}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                </div>
                <div className="min-w-0 space-y-0.5 text-left">
                  <p className="text-sm font-medium transition-colors group-hover:text-primary">
                    {action.title}
                  </p>
                  <p className="text-xs text-muted-foreground">{action.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
