import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";

import { ErrorAlert } from "@/components/common/ErrorAlert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDueDateForDisplay } from "@/lib/assignment-utils";
import { cn } from "@/lib/utils";
import { dashboardColors } from "@/pages/Instructor/InstructorDashboard/dashboardColors";
import type { GeneratedAssignmentDraft } from "@/types/assignmentCreate";

import {
  assignmentReviewSchema,
  type AssignmentReviewFormSchema,
} from "./assignmentCreateSchema";

interface AssignmentReviewApproveStepProps {
  courseLabel: string;
  draft: GeneratedAssignmentDraft;
  approveError?: string | null;
  isApproving: boolean;
  onApprove: (values: AssignmentReviewFormSchema) => void;
  onBack: () => void;
}

export function AssignmentReviewApproveStep({
  courseLabel,
  draft,
  approveError,
  isApproving,
  onApprove,
  onBack,
}: AssignmentReviewApproveStepProps) {
  const {
    register,
    handleSubmit,
    control,
    trigger,
    formState: { errors, isValid },
  } = useForm<AssignmentReviewFormSchema>({
    resolver: zodResolver(assignmentReviewSchema),
    defaultValues: {
      name: draft.name,
      description: draft.description,
      dueDate: draft.dueDate,
      pointsPossible: draft.pointsPossible,
    },
    mode: "onChange",
  });

  const dueDateValue = useWatch({
    control,
    name: "dueDate",
    defaultValue: draft.dueDate,
  });

  useEffect(() => {
    void trigger();
  }, [trigger]);

  return (
    <Card className="shadow-sm ring-1 ring-border/60">
      <CardHeader className="space-y-2">
        <CardTitle>Review & Approve</CardTitle>
        <p className="text-sm text-muted-foreground">
          Review the AI-generated assignment for {courseLabel}. Edit any fields
          before approving.
        </p>
      </CardHeader>
      <form onSubmit={handleSubmit(onApprove)} noValidate>
        <CardContent className="space-y-5">
          <div className="rounded-xl border bg-muted/20 p-4">
            <p className="text-sm font-medium">Generated draft</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Edit any field below, including the points value, before
              approving.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="review-title">Assignment title</Label>
            <Input
              id="review-title"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "review-title-error" : undefined}
              {...register("name")}
            />
            {errors.name ? (
              <p
                id="review-title-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {errors.name.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="review-description">Assignment description</Label>
            <Textarea
              id="review-description"
              rows={8}
              aria-invalid={Boolean(errors.description)}
              aria-describedby={
                errors.description ? "review-description-error" : undefined
              }
              {...register("description")}
            />
            {errors.description ? (
              <p
                id="review-description-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {errors.description.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="review-due-date">Due date</Label>
            <Input
              id="review-due-date"
              type="datetime-local"
              aria-invalid={Boolean(errors.dueDate)}
              aria-describedby={errors.dueDate ? "review-due-date-error" : undefined}
              {...register("dueDate")}
            />
            <p className="text-sm text-muted-foreground">
              Due: {formatDueDateForDisplay(dueDateValue || null)}
            </p>
            {errors.dueDate ? (
              <p
                id="review-due-date-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {errors.dueDate.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="review-points-possible">Points possible</Label>
            <Input
              id="review-points-possible"
              type="number"
              min="0"
              step="1"
              aria-invalid={Boolean(errors.pointsPossible)}
              aria-describedby={
                errors.pointsPossible ? "review-points-possible-error" : undefined
              }
              {...register("pointsPossible")}
            />
            {errors.pointsPossible ? (
              <p
                id="review-points-possible-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {errors.pointsPossible.message}
              </p>
            ) : null}
          </div>

          {approveError ? <ErrorAlert message={approveError} /> : null}
        </CardContent>
        <CardFooter className="flex flex-col gap-3 border-t bg-transparent sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" onClick={onBack} disabled={isApproving}>
            Back to Describe
          </Button>
          <Button
            type="submit"
            className={cn(dashboardColors.blue.button)}
            disabled={isApproving || !isValid}
          >
            {isApproving ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Approving...
              </>
            ) : (
              "Approve Assignment"
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
