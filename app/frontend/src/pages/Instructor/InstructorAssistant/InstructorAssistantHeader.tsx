import {
  BarChart3,
  FilePlus2,
  ListChecks,
  MessageSquare,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  dashboardColors,
  dashboardInteractive,
} from "@/pages/Instructor/InstructorDashboard/dashboardColors";
import type { SuggestedAction } from "@/types/chat";

const actionIcons = {
  "create-assignment": FilePlus2,
  "create-quiz": ListChecks,
  "course-analytics": BarChart3,
  "draft-student-message": MessageSquare,
} as const;

interface InstructorAssistantSuggestedActionsProps {
  actions: SuggestedAction[];
  onSelect: (prompt: string) => void;
  disabled?: boolean;
  /**
   * First-time empty-chat guidance only. Hidden after the user starts a
   * conversation so the prompts do not clutter an active thread (#1441).
   */
  visible?: boolean;
}

export function InstructorAssistantSuggestedActions({
  actions,
  onSelect,
  disabled = false,
  visible = true,
}: InstructorAssistantSuggestedActionsProps) {
  if (!visible) {
    return null;
  }

  return (
    <section aria-label="Starter prompts" className="shrink-0 space-y-2.5">
      <div className="flex items-center gap-2 px-0.5">
        <span className="h-5 w-1 rounded-full bg-primary" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">
            Starter prompts
          </h2>
          <p className="text-xs text-muted-foreground">
            Try a one-line request — or type your own below.
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {actions.map((action) => {
          const Icon =
            actionIcons[action.id as keyof typeof actionIcons] ?? FilePlus2;

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
                <p className="text-xs text-muted-foreground">
                  {action.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
