import { Bot, ClipboardList, HelpCircle, Megaphone, MessageSquare, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { resolveQuickAction } from "@/lib/quick-actions";
import { cn } from "@/lib/utils";
import { paths } from "@/routes/paths";
import type { DashboardQuickAction } from "@/types/dashboard";

import { dashboardColors, dashboardInteractive } from "./dashboardColors";

interface InstructorDashboardQuickActionsProps {
  actions: DashboardQuickAction[];
}

const actionIcons = {
  "create-assignment": ClipboardList,
  "create-quiz": HelpCircle,
  "create-feedback": MessageSquare,
  "draft-announcement": Megaphone,
  "analyse-missing-submissions": Bot,
} as const;

export function InstructorDashboardQuickActions({
  actions,
}: InstructorDashboardQuickActionsProps) {
  const navigate = useNavigate();

  const openAssistant = () => {
    navigate(paths.instructor.assistant);
  };

  const openQuickAction = (actionId: string) => {
    const behaviour = resolveQuickAction(actionId);

    if (behaviour?.kind === "navigate") {
      if (behaviour.state) {
        navigate(behaviour.path, { state: behaviour.state });
      } else {
        navigate(behaviour.path);
      }
      return;
    }

    // Prompt-backed actions run in the assistant, which this surface has to
    // navigate to — carrying the prompt so it opens mid-task rather than blank.
    if (behaviour?.kind === "prompt") {
      navigate(paths.instructor.assistant, {
        state: { initialPrompt: behaviour.prompt },
      });
      return;
    }

    openAssistant();
  };

  return (
    <Card className="shadow-sm ring-1 ring-border/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles
            className={cn("size-4", dashboardColors.blue.accent)}
            aria-hidden="true"
          />
          Quick AI Actions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {actions.map((action) => {
          const Icon =
            actionIcons[action.id as keyof typeof actionIcons] ?? Bot;

          return (
            <button
              key={action.id}
              type="button"
              onClick={() => openQuickAction(action.id)}

              className={dashboardInteractive.actionCard}
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
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-medium transition-colors group-hover:text-primary">
                  {action.title}
                </p>
                <p className="text-sm text-muted-foreground">
                  {action.description}
                </p>
              </div>
            </button>
          );
        })}
      </CardContent>
      <CardFooter className="border-t-0 bg-transparent pt-0">
        <Button
          className={cn("w-full", dashboardColors.blue.button)}
          size="lg"
          onClick={() => navigate(paths.instructor.assistant)}
        >
          Open AI Assistant
        </Button>
      </CardFooter>
    </Card>
  );
}
