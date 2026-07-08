import { Loader2 } from "lucide-react";

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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton={!isCreating}>
        <DialogHeader>
          <DialogTitle>Create this assignment?</DialogTitle>
          <DialogDescription>
            {preview?.summary ?? "Review what will be created in Canvas."}
          </DialogDescription>
        </DialogHeader>

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
