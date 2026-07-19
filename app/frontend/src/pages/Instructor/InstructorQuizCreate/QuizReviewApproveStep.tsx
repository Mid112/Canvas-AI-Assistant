import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";

import { ErrorAlert } from "@/components/common/ErrorAlert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDueDateForDisplay } from "@/lib/assignment-utils";
import { cn } from "@/lib/utils";
import { dashboardColors } from "@/pages/Instructor/InstructorDashboard/dashboardColors";
import type { GeneratedQuizDraft } from "@/types/quizCreate";

import {
  quizReviewSchema,
  type QuizReviewFormInput,
  type QuizReviewFormSchema,
} from "./quizCreateSchema";

interface QuizReviewApproveStepProps {
  courseLabel: string;
  draft: GeneratedQuizDraft;
  approveError?: string | null;
  isApproving: boolean;
  onApprove: (values: QuizReviewFormSchema) => void;
  onBack: () => void;
}

export function QuizReviewApproveStep({
  courseLabel,
  draft,
  approveError,
  isApproving,
  onApprove,
  onBack,
}: QuizReviewApproveStepProps) {
  const {
    register,
    handleSubmit,
    control,
    trigger,
    formState: { errors, isValid },
  } = useForm<QuizReviewFormInput, unknown, QuizReviewFormSchema>({
    resolver: zodResolver(quizReviewSchema),
    defaultValues: {
      name: draft.name,
      description: draft.description,
      dueDate: draft.dueDate,
      pointsPossible: draft.pointsPossible,
      allowedAttempts: draft.allowedAttempts,
      timeLimit: draft.timeLimit,
      questions: draft.questions,
    },
    mode: "onChange",
  });

  const { fields } = useFieldArray({ control, name: "questions" });

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
          Review the AI-generated quiz for {courseLabel}. Edit any fields
          before approving — edits regenerate the Canvas preview.
        </p>
      </CardHeader>
      <form onSubmit={handleSubmit(onApprove)} noValidate>
        <CardContent className="space-y-5">
          <div className="rounded-xl border bg-muted/20 p-4">
            <p className="text-sm font-medium">Generated draft</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Edit title, instructions, due date, scoring, or questions before
              creating the quiz in Canvas.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quiz-review-title">Quiz title</Label>
            <Input
              id="quiz-review-title"
              aria-invalid={Boolean(errors.name)}
              {...register("name")}
            />
            {errors.name ? (
              <p role="alert" className="text-sm text-destructive">
                {errors.name.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="quiz-review-description">Quiz instructions</Label>
            <Textarea
              id="quiz-review-description"
              rows={6}
              aria-invalid={Boolean(errors.description)}
              {...register("description")}
            />
            {errors.description ? (
              <p role="alert" className="text-sm text-destructive">
                {errors.description.message}
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quiz-review-due-date">Due date</Label>
              <Input
                id="quiz-review-due-date"
                type="datetime-local"
                aria-invalid={Boolean(errors.dueDate)}
                {...register("dueDate")}
              />
              <p className="text-sm text-muted-foreground">
                Due: {formatDueDateForDisplay(dueDateValue || null)}
              </p>
              {errors.dueDate ? (
                <p role="alert" className="text-sm text-destructive">
                  {errors.dueDate.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="quiz-review-points">Points possible</Label>
              <Input
                id="quiz-review-points"
                type="number"
                min="0"
                step="1"
                aria-invalid={Boolean(errors.pointsPossible)}
                {...register("pointsPossible", { valueAsNumber: true })}
              />
              {errors.pointsPossible ? (
                <p role="alert" className="text-sm text-destructive">
                  {errors.pointsPossible.message}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quiz-review-attempts">Allowed attempts</Label>
              <Input
                id="quiz-review-attempts"
                type="number"
                min="1"
                step="1"
                {...register("allowedAttempts", {
                  setValueAs: (value) =>
                    value === "" || value == null ? null : Number(value),
                })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quiz-review-time-limit">Time limit (minutes)</Label>
              <Input
                id="quiz-review-time-limit"
                type="number"
                min="1"
                step="1"
                placeholder="Optional"
                {...register("timeLimit", {
                  setValueAs: (value) =>
                    value === "" || value == null ? null : Number(value),
                })}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">Questions ({fields.length})</p>
              <p className="text-sm text-muted-foreground">
                Edit question text before creating the quiz.
              </p>
            </div>
            {fields.map((field, index) => (
              <div
                key={field.id}
                className="space-y-2 rounded-lg border border-border/70 p-3"
              >
                <Label htmlFor={`quiz-question-${index}`}>
                  Question {index + 1}
                </Label>
                <Textarea
                  id={`quiz-question-${index}`}
                  rows={3}
                  {...register(`questions.${index}.questionText`)}
                />
                <input type="hidden" {...register(`questions.${index}.questionType`)} />
                <Input
                  type="number"
                  min="0"
                  step="1"
                  aria-label={`Points for question ${index + 1}`}
                  {...register(`questions.${index}.pointsPossible`, {
                    valueAsNumber: true,
                  })}
                />
              </div>
            ))}
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
              "Preview & Approve Quiz"
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
