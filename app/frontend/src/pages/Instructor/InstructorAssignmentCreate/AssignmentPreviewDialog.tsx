import { ChevronDown, Loader2 } from "lucide-react";
import { useState } from "react";

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
import type { AssignmentPreviewSummary } from "@/types/assignmentCreate";

interface AssignmentPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: AssignmentPreviewSummary | null;
  isCreating: boolean;
  onConfirm: () => void;
}

export function AssignmentPreviewDialog({
  open,
  onOpenChange,
  preview,
  isCreating,
  onConfirm,
}: AssignmentPreviewDialogProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton={!isCreating}>
        <DialogHeader>
          <DialogTitle>Create this assignment?</DialogTitle>
          <DialogDescription>
            {preview?.summary ?? "Review what will be created in Canvas."}
          </DialogDescription>
        </DialogHeader>

        {preview && (preview.title || preview.dueDate || preview.pointsPossible) ? (
          <dl className="grid gap-2 rounded-md border border-border/70 p-3 text-sm">
            {preview.title ? (
              <div>
                <dt className="text-muted-foreground">Title</dt>
                <dd className="font-medium">{preview.title}</dd>
              </div>
            ) : null}
            {preview.dueDate ? (
              <div>
                <dt className="text-muted-foreground">Due</dt>
                <dd className="font-medium">{preview.dueDate}</dd>
              </div>
            ) : null}
            {preview.pointsPossible ? (
              <div>
                <dt className="text-muted-foreground">Points</dt>
                <dd className="font-medium">{preview.pointsPossible}</dd>
              </div>
            ) : null}
            {preview.descriptionPreview ? (
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Description</dt>
                <dd className="font-medium whitespace-pre-wrap">
                  {preview.descriptionPreview}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        {preview && preview.affectedResources.length > 0 ? (
          <ul className="space-y-1 text-sm text-muted-foreground">
            {preview.affectedResources.map((resource) => (
              <li key={`${resource.type}-${resource.name}`}>
                {resource.type}: <span className="font-medium">{resource.name}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <p className="text-xs text-muted-foreground">
          {preview?.reversible
            ? "This can be edited or removed in Canvas afterward."
            : "This action cannot be undone."}
        </p>

        <button
          type="button"
          className="flex w-full items-center justify-between rounded-md border border-border/70 px-3 py-2 text-left text-sm"
          aria-expanded={detailsOpen}
          onClick={() => setDetailsOpen((current) => !current)}
        >
          Technical details
          <ChevronDown
            className={cn(
              "size-4 transition-transform",
              detailsOpen && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>
        {detailsOpen && preview ? (
          <dl className="grid gap-2 rounded-md bg-muted/40 p-3 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Action</dt>
              <dd className="font-medium">Create assignment</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Reversible</dt>
              <dd className="font-medium">
                {preview.reversible ? "Yes" : "No"}
              </dd>
            </div>
          </dl>
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
