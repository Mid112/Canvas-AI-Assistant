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
  "analyse-missing-submissions": BarChart3,
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

  // Titles + icons only — drop the section helper and per-card descriptions so
  // generation actions stay visible without eating chat space (#1454). Only
  // the wording changed when these became quick actions: two of them now open
  // a creator page rather than sending a prompt, so "Starter prompts"
  // described half the grid.
  return (
    <section aria-label="Quick actions" className="shrink-0 space-y-2">
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Quick actions
      </h2>

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
                "items-center py-2.5",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <div
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center",
                  dashboardColors.red.iconSquare,
                  dashboardInteractive.actionIcon,
                )}
              >
                <Icon className="size-3.5" aria-hidden="true" />
              </div>
              <p className="min-w-0 text-left text-sm font-medium transition-colors group-hover:text-primary">
                {action.title}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
