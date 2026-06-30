import {
  BarChart3,
  ClipboardList,
  FileText,
  Sparkles,
} from "lucide-react";

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
    <div className="flex items-start gap-3">
      <div
        className={cn(
          "flex size-11 shrink-0 items-center justify-center",
          dashboardColors.purple.iconSquare,
        )}
      >
        <Sparkles className="size-5" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          {title}
        </h1>
        <p className="text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

const actionIcons = {
  "missing-submissions": ClipboardList,
  "summarize-quiz": FileText,
  "late-assignments": ClipboardList,
  "course-performance": BarChart3,
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
  return (
    <section aria-label="Suggested actions" className="space-y-3">
      <h2 className="text-sm font-semibold">Suggested Actions</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {actions.map((action) => {
          const Icon =
            actionIcons[action.id as keyof typeof actionIcons] ?? Sparkles;

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
                  "flex size-9 shrink-0 items-center justify-center",
                  dashboardColors.blue.iconSquare,
                  dashboardInteractive.actionIcon,
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
              </div>
              <div className="min-w-0 space-y-0.5 text-left">
                <p className="text-sm font-medium transition-colors group-hover:text-blue-700">
                  {action.title}
                </p>
                <p className="text-sm text-muted-foreground">
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
