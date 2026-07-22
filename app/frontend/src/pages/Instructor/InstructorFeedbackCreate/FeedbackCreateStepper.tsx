import type { FeedbackCreateStep } from "@/types/feedbackCreate";

interface FeedbackCreateStepperProps {
  currentStep: FeedbackCreateStep;
}

const steps: { id: FeedbackCreateStep; label: string }[] = [
  { id: "describe", label: "Describe" },
  { id: "review", label: "Review & Approve" },
];

export function FeedbackCreateStepper({ currentStep }: FeedbackCreateStepperProps) {
  const currentIndex = steps.findIndex((step) => step.id === currentStep);

  return (
    <ol className="mb-6 flex items-center gap-2 text-sm">
      {steps.map((step, index) => {
        const isActive = index === currentIndex;
        const isComplete = index < currentIndex;
        return (
          <li key={step.id} className="flex items-center gap-2">
            <span
              className={[
                "inline-flex size-6 items-center justify-center rounded-full text-xs font-medium",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : isComplete
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground",
              ].join(" ")}
            >
              {index + 1}
            </span>
            <span className={isActive ? "font-medium" : "text-muted-foreground"}>
              {step.label}
            </span>
            {index < steps.length - 1 ? (
              <span className="mx-1 text-muted-foreground">→</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
