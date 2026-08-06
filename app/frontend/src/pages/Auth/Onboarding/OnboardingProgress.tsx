// Auth page note: handles onboarding progress onboarding/authentication UI while keeping Canvas connection steps explicit.

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export type OnboardingStep =
  | "canvasInfo"
  | "connectCanvas"
  | "reviewPermissions"
  | "dashboard";

interface StepConfig {
  id: OnboardingStep;
  label: string;
}

const STEPS: StepConfig[] = [
  { id: "canvasInfo", label: "Canvas Info" },
  { id: "connectCanvas", label: "Connect Canvas Account" },
  { id: "reviewPermissions", label: "Review Permissions" },
  { id: "dashboard", label: "Dashboard" },
];

interface OnboardingProgressProps {
  currentStep: OnboardingStep;
}

function getStepIndex(step: OnboardingStep): number {
  return STEPS.findIndex((s) => s.id === step);
}

export function OnboardingProgress({ currentStep }: OnboardingProgressProps) {
  const currentIndex = getStepIndex(currentStep);

  return (
    <nav
      aria-label="Onboarding progress"
      className="mb-8 w-full max-w-3xl"
    >
      <ol className="flex items-center">
        {STEPS.map((step, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isLast = index === STEPS.length - 1;

          return (
            <li
              key={step.id}
              className={cn("flex items-center", !isLast && "flex-1")}
            >
              <div className="flex flex-col items-center gap-2">
                <div
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full border-2",
                    isCompleted &&
                      "border-emerald-600 bg-emerald-600 text-primary-foreground",
                    isCurrent &&
                      "border-primary bg-primary text-primary-foreground",
                    !isCompleted &&
                      !isCurrent &&
                      "border-input bg-card text-muted-foreground",
                  )}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  {isCompleted ? (
                    <Check className="size-4" aria-hidden="true" />
                  ) : isCurrent ? (
                    <span
                      className="size-2.5 rounded-full bg-white"
                      aria-hidden="true"
                    />
                  ) : null}
                </div>
                <span
                  className={cn(
                    "max-w-24 text-center text-xs font-medium leading-tight sm:max-w-none sm:whitespace-nowrap",
                    isCurrent && "text-primary",
                    isCompleted && "text-emerald-600",
                    !isCompleted && !isCurrent && "text-muted-foreground",
                  )}
                >
                  {step.label}
                </span>
              </div>
              {!isLast && (
                <div
                  className={cn(
                    "mx-2 mb-6 h-0.5 flex-1 sm:mx-3",
                    index < currentIndex ? "bg-emerald-600" : "bg-border",
                  )}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
