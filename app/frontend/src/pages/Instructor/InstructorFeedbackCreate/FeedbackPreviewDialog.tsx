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
import type { FeedbackPreviewSummary } from "@/types/feedbackCreate";

interface FeedbackPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: FeedbackPreviewSummary | null;
  isPosting: boolean;
  onConfirm: () => void;
}

export function FeedbackPreviewDialog({
  open,
  onOpenChange,
  preview,
  isPosting,
  onConfirm,
}: FeedbackPreviewDialogProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Feedback is confirmed on the same terms as a grade change: a posted
  // Canvas comment is visible to the student immediately and cannot be
  // un-posted, so it carries update_grade's status rather than a softer one.
  const riskLevel = "high" as const;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" showCloseButton={!isPosting}>
        <DialogHeader>
          {/* pr-8 clears the dialog's absolutely positioned close button. */}
          <div className="flex items-start justify-between gap-3 pr-8">
            <DialogTitle>Post this feedback?</DialogTitle>
            <ActionStatusBadges
              level={riskLevel}
              reversible={false}
              className="shrink-0"
            />
          </div>
          <DialogDescription>
            {preview?.summary ?? "Review what will be posted to Canvas."}
          </DialogDescription>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Grade and feedback will be written to the student submission.
        </p>

        {preview && preview.affectedResources.length > 0 ? (
          <ul className="space-y-1 text-sm text-muted-foreground">
            {preview.affectedResources.map((resource) => (
              <li key={`${resource.type}-${resource.name}`}>
                {resource.type}:{" "}
                <span className="font-medium text-foreground">{resource.name}</span>
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
          <p className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
            Canvas write: PUT submission grade and comment for the selected student.
          </p>
        ) : null}

        <DialogFooter className="sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPosting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className={cn(dashboardColors.blue.button)}
            onClick={onConfirm}
            disabled={isPosting}
          >
            {isPosting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Posting...
              </>
            ) : (
              "Confirm & Post"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
