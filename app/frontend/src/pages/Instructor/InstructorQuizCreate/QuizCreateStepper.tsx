import { cn } from "@/lib/utils";
import { dashboardColors } from "@/pages/Instructor/InstructorDashboard/dashboardColors";
import type { QuizCreateStep } from "@/types/quizCreate";

interface QuizCreateStepperProps {
  currentStep: QuizCreateStep;
}

const steps = [
  { id: "describe" as const, number: 1, label: "Describe Quiz" },
  { id: "review" as const, number: 2, label: "Review & Approve" },
];

export function QuizCreateStepper({ currentStep }: QuizCreateStepperProps) {
  const currentIndex = steps.findIndex((step) => step.id === currentStep);

  return (
    <ol className="flex flex-wrap items-center gap-4 md:gap-8">
      {steps.map((step, index) => {
        const isActive = step.id === currentStep;
        const isComplete = index < currentIndex;

        return (
          <li key={step.id} className="flex items-center gap-3">
            <div
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                isActive || isComplete
                  ? cn(dashboardColors.blue.button, "text-white")
                  : "bg-muted text-muted-foreground",
              )}
              aria-hidden="true"
            >
              {step.number}
            </div>
            <div className="space-y-0.5">
              <p
                className={cn(
                  "text-sm font-medium",
                  isActive ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {step.label}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
