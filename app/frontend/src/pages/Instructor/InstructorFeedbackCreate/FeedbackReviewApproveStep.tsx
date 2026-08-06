// Instructor page note: coordinates feedback review approve step UI state with Canvas-backed services and active-course context.

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
import { cn } from "@/lib/utils";
import { dashboardColors } from "@/pages/Instructor/InstructorDashboard/dashboardColors";
import type { GeneratedFeedbackDraft } from "@/types/feedbackCreate";

import {
  feedbackReviewSchema,
  type FeedbackReviewFormSchema,
} from "./feedbackCreateSchema";

interface FeedbackReviewApproveStepProps {
  courseLabel: string;
  draft: GeneratedFeedbackDraft;
  approveError?: string | null;
  isApproving: boolean;
  onApprove: (values: FeedbackReviewFormSchema) => void;
  onBack: () => void;
  /** Keep parent draft state in sync with form edits (for Save draft). */
  onDraftChange?: (values: GeneratedFeedbackDraft) => void;
}

export function FeedbackReviewApproveStep({
  courseLabel,
  draft,
  approveError,
  isApproving,
  onApprove,
  onBack,
  onDraftChange,
}: FeedbackReviewApproveStepProps) {
  const {
    register,
    handleSubmit,
    control,
    trigger,
    formState: { errors, isValid },
  } = useForm<FeedbackReviewFormSchema>({
    resolver: zodResolver(feedbackReviewSchema),
    defaultValues: {
      assignmentName: draft.assignmentName,
      studentName: draft.studentName,
      newGrade: draft.newGrade,
      feedback: draft.feedback,
    },
    mode: "onChange",
  });

  const watchedValues = useWatch({ control });

  useEffect(() => {
    void trigger();
  }, [trigger]);

  useEffect(() => {
    if (!onDraftChange) return;
    onDraftChange({
      assignmentId: draft.assignmentId,
      studentId: draft.studentId,
      assignmentName: String(
        watchedValues.assignmentName ?? draft.assignmentName,
      ),
      studentName: String(watchedValues.studentName ?? draft.studentName),
      newGrade: String(watchedValues.newGrade ?? draft.newGrade),
      feedback: String(watchedValues.feedback ?? draft.feedback),
    });
  }, [
    onDraftChange,
    watchedValues,
    draft.assignmentId,
    draft.studentId,
    draft.assignmentName,
    draft.studentName,
    draft.newGrade,
    draft.feedback,
  ]);

  return (
    <Card className="shadow-sm ring-1 ring-border/60">
      <CardHeader className="space-y-2">
        <CardTitle>Review & Approve</CardTitle>
        <p className="text-sm text-muted-foreground">
          Review the AI-generated grade and feedback for {courseLabel}. Edit any
          field before posting to Canvas.
        </p>
      </CardHeader>
      <form onSubmit={handleSubmit(onApprove)} noValidate>
        <CardContent className="space-y-5">
          <div className="rounded-xl border bg-muted/20 p-4">
            <p className="text-sm font-medium">Generated draft</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Your edits here are preserved exactly as written when feedback is
              posted.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="feedback-assignment-name">Assignment</Label>
              <Input id="feedback-assignment-name" readOnly {...register("assignmentName")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="feedback-student-name">Student</Label>
              <Input id="feedback-student-name" readOnly {...register("studentName")} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback-grade">Grade</Label>
            {draft.currentGrade ? (
              <p className="text-xs text-muted-foreground">
                Current grade: <span className="font-medium text-foreground">{draft.currentGrade}</span>
                {" → "}
                proposed below
              </p>
            ) : null}
            <Input
              id="feedback-grade"
              aria-invalid={Boolean(errors.newGrade)}
              {...register("newGrade")}
            />
            {errors.newGrade ? (
              <p role="alert" className="text-sm text-destructive">
                {errors.newGrade.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback-comment">Feedback comment</Label>
            <Textarea
              id="feedback-comment"
              rows={8}
              aria-invalid={Boolean(errors.feedback)}
              {...register("feedback")}
            />
            {errors.feedback ? (
              <p role="alert" className="text-sm text-destructive">
                {errors.feedback.message}
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
                Preparing preview...
              </>
            ) : (
              "Preview & Approve Feedback"
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
