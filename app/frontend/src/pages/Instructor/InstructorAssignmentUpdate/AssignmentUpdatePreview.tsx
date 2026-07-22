import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { buildAssignmentChanges } from "@/lib/assignment-utils";
import type { Assignment, AssignmentFormValues } from "@/types/assignment";

import { AssignmentFieldComparison } from "./AssignmentFieldComparison";

interface AssignmentUpdatePreviewProps {
  assignment: Assignment;
  proposedValues: AssignmentFormValues;
  isSubmitting?: boolean;
  submitError?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function AssignmentUpdatePreview({
  assignment,
  proposedValues,
  isSubmitting = false,
  submitError,
  onConfirm,
  onCancel,
}: AssignmentUpdatePreviewProps) {
  const changes = buildAssignmentChanges(assignment, proposedValues);

  return (
    <Card className="shadow-sm ring-1 ring-border/60">
      <CardHeader className="space-y-2">
        <CardTitle>Preview Changes</CardTitle>
        <p className="text-sm text-muted-foreground">
          Review the proposed updates before sending them to Canvas.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl border bg-muted/20 p-4">
          <p className="text-sm font-medium">Affected assignment</p>
          <p className="mt-1 text-base font-semibold">{assignment.name}</p>
        </div>

        {changes.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            No changes detected. Return to edit mode to update the assignment.
          </p>
        ) : (
          <div className="space-y-4">
            {changes.map((change) => (
              <AssignmentFieldComparison key={change.field} change={change} />
            ))}
          </div>
        )}

        {submitError ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {submitError}
          </p>
        ) : null}
      </CardContent>
      <CardFooter className="flex flex-col gap-3 border-t bg-transparent sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel Changes
        </Button>
        <Button
          type="button"
          onClick={onConfirm}
          disabled={isSubmitting || changes.length === 0}
        >
          {isSubmitting ? "Saving..." : "Confirm Changes"}
        </Button>
      </CardFooter>
    </Card>
  );
}
