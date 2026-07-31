import {
  BarChart3,
  ChevronDown,
  ClipboardList,
  MessageSquare,
} from "lucide-react";
import { useState } from "react";

import { AssistantAvatar } from "@/components/brand/AssistantAvatar";
import { cn } from "@/lib/utils";
import {
  dashboardColors,
  dashboardInteractive,
} from "@/pages/Instructor/InstructorDashboard/dashboardColors";
import type { SuggestedAction } from "@/types/chat";

interface InstructorAssistantHeaderProps {
  title?: string;
  subtitle?: string;
}

export function InstructorAssistantHeader({
  title = "AI Assistant",
  subtitle = "Canvas Workflow Management Assistant",
}: InstructorAssistantHeaderProps) {
  return (
    <div className="flex shrink-0 items-center gap-3">
      <AssistantAvatar size="sm" />
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-tight md:text-xl">{title}</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

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
    <section aria-label="Suggested actions" className="shrink-0 space-y-2">
      <button
        type="button"
        onClick={() => setIsExpanded((current) => !current)}
        aria-expanded={isExpanded}
        aria-controls="suggested-actions-content"
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <h2 className="text-sm font-semibold">Suggested actions</h2>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            isExpanded && "rotate-180",
          )}
          aria-hidden="true"
        />
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
