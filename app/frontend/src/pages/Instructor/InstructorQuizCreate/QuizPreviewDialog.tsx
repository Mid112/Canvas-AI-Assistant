import { ChevronDown, Loader2 } from "lucide-react";
import { useState } from "react";

import { ActionStatusBadges } from "@/components/status/ActionStatusBadges";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { dashboardColors } from "@/pages/Instructor/InstructorDashboard/dashboardColors";
import type { QuizPreviewSummary } from "@/types/quizCreate";

interface QuizPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: QuizPreviewSummary | null;
  isCreating: boolean;
  onConfirm: () => void;
}

export function QuizPreviewDialog({
  open,
  onOpenChange,
  preview,
  isCreating,
  onConfirm,
}: QuizPreviewDialogProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const riskLevel = preview?.riskLevel ?? "medium";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" showCloseButton={!isCreating}>
        <DialogHeader>
          {/* pr-8 clears the dialog's absolutely positioned close button. */}
          <div className="flex items-start justify-between gap-3 pr-8">
            <DialogTitle>Create this quiz?</DialogTitle>
            {preview ? (
              <ActionStatusBadges
                level={riskLevel}
                reversible={preview.reversible}
                className="shrink-0"
              />
            ) : null}
          </div>
          <DialogDescription>
            {preview?.summary ?? "Review what will be created in Canvas."}
          </DialogDescription>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          {preview?.reversible
            ? "This can be edited or removed in Canvas afterward."
            : "This action cannot be undone."}
        </p>

        {preview && preview.affectedResources.length > 0 ? (
          <ul className="space-y-1 text-sm text-muted-foreground">
            {preview.affectedResources.map((resource) => (
              <li key={`${resource.type}-${resource.name}`}>
                {resource.type}: <span className="font-medium text-foreground">{resource.name}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <button
          type="button"
          className="flex w-full items-center justify-between rounded-md border border-border/70 px-3 py-2 text-left text-sm"
          onClick={() => setDetailsOpen((value) => !value)}
          aria-expanded={detailsOpen}
        >
          <span>Technical details</span>
          <ChevronDown
            className={cn("size-4 transition-transform", detailsOpen && "rotate-180")}
            aria-hidden="true"
          />
        </button>
        {detailsOpen && preview ? (
          <pre className="max-h-48 overflow-auto rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
            {JSON.stringify(
              {
                action: "create_quiz",
                quiz_engine: preview.metadata.quiz_engine ?? "classic",
                risk_level: preview.riskLevel,
                reversible: preview.reversible,
                api:
                  preview.metadata.quiz_engine === "new_quizzes"
                    ? "POST /api/quiz/v1/courses/:course_id/quizzes"
                    : "POST /api/v1/canvas/courses/:course_id/quizzes",
                metadata: preview.metadata,
              },
              null,
              2,
            )}
          </pre>
        ) : null}

        <DialogFooter className="sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isCreating}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className={cn(dashboardColors.blue.button)}
            onClick={onConfirm}
            disabled={isCreating}
          >
            {isCreating ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Creating...
              </>
            ) : (
              "Confirm & Create"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
