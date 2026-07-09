import { Bot, ClipboardList, Megaphone, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { paths } from "@/routes/paths";
import type { DashboardQuickAction } from "@/types/dashboard";

import { dashboardColors, dashboardInteractive } from "./dashboardColors";

interface InstructorDashboardQuickActionsProps {
  actions: DashboardQuickAction[];
}

const actionIcons = {
  "create-assignment": ClipboardList,
  "draft-announcement": Megaphone,
  "grade-analysis": Bot,
} as const;

// Prompts that take the instructor straight into a real assistant turn for
// that specific task, rather than dropping them on the same blank chat as
// the generic "Open AI Assistant" button — see the AI assistant persona
// review: these two actions used to be indistinguishable from that button.
const quickActionPrompts: Record<string, string> = {
  "draft-announcement":
    "Help me draft a course announcement for my active course.",
  "grade-analysis":
    "Give me a grade and submission performance analysis for my active course.",
};

export function InstructorDashboardQuickActions({
  actions,
}: InstructorDashboardQuickActionsProps) {
  const navigate = useNavigate();

  const openAssistant = () => {
    navigate(paths.instructor.assistant);
  };

  const openQuickAction = (actionId: string) => {
    if (actionId === "create-assignment") {
      navigate(paths.instructor.assignmentCreate);
      return;
    }

    const initialPrompt = quickActionPrompts[actionId];
    if (initialPrompt) {
      navigate(paths.instructor.assistant, { state: { initialPrompt } });
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
