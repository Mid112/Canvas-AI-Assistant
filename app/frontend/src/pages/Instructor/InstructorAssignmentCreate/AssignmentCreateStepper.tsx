// Instructor page note: coordinates assignment create stepper UI state with Canvas-backed services and active-course context.

import { cn } from "@/lib/utils";
import { dashboardColors } from "@/pages/Instructor/InstructorDashboard/dashboardColors";
import type { AssignmentCreateStep } from "@/types/assignmentCreate";

interface AssignmentCreateStepperProps {
  currentStep: AssignmentCreateStep;
  canNavigateToReview?: boolean;
  onStepChange?: (step: AssignmentCreateStep) => void;
}

const steps = [
  { id: "describe" as const, number: 1, label: "Describe Assignment" },
  { id: "review" as const, number: 2, label: "Review & Approve" },
];

export function AssignmentCreateStepper({
  currentStep,
  canNavigateToReview = false,
  onStepChange,
}: AssignmentCreateStepperProps) {
  const currentIndex = steps.findIndex((step) => step.id === currentStep);

  return (
    <ol className="flex flex-wrap items-center gap-4 md:gap-8">
      {steps.map((step, index) => {
        const isActive = step.id === currentStep;
        const isComplete = index < currentIndex;

        const isNavigable =
          Boolean(onStepChange) &&
          step.id !== currentStep &&
          (step.id === "describe" || canNavigateToReview);

        return (
          <li key={step.id} className="flex items-center gap-3">
            <button
              type="button"
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                isNavigable ? "cursor-pointer" : "cursor-default",
                isActive || isComplete
                  ? cn(dashboardColors.blue.button, "text-white")
                  : "bg-muted text-muted-foreground",
              )}
              aria-current={isActive ? "step" : undefined}
              aria-label={`Go to ${step.label}`}
              disabled={!isNavigable}
              onClick={() => onStepChange?.(step.id)}
            >
              {step.number}
            </button>
            <div className="space-y-0.5">
              <button
                type="button"
                className={cn(
                  "text-sm font-medium",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isNavigable ? "cursor-pointer hover:text-foreground" : "cursor-default",
                  isActive ? "text-foreground" : "text-muted-foreground",
                )}
                disabled={!isNavigable}
                onClick={() => onStepChange?.(step.id)}
              >
                {step.label}
              </button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
