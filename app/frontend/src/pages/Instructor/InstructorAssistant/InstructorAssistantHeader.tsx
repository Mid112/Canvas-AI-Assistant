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
  "grade-analysis": BarChart3,
  "draft-announcement": MessageSquare,
} as const;

interface InstructorAssistantSuggestedActionsProps {
  actions: SuggestedAction[];
  /** Receives the action id, not a prompt: some of these open a creator page
   * rather than starting a chat turn, and only the page knows how to do both. */
  onSelect: (actionId: string) => void;
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
    <section aria-label="Quick actions" className="shrink-0 space-y-2.5">
      <div className="flex items-center gap-2 px-0.5">
        <span className="h-5 w-1 rounded-full bg-primary" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">
            Quick actions
          </h2>
          {/* No longer "starter prompts": two of these open a creator page
              rather than sending a message, so the old copy described only
              half the grid. */}
          <p className="text-xs text-muted-foreground">
            Jump into a creator or an analysis — or type your own request below.
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
              onClick={() => onSelect(action.id)}
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
