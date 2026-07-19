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
import type {
  GeneratedQuizDraft,
  QuizCapabilities,
  QuizQuestionBank,
} from "@/types/quizCreate";

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
  capabilities?: QuizCapabilities | null;
  questionBanks?: QuizQuestionBank[];
  isLoadingQuestionBanks?: boolean;
  onLoadQuestionBanks?: () => void;
}

export function QuizReviewApproveStep({
  courseLabel,
  draft,
  approveError,
  isApproving,
  onApprove,
  onBack,
  capabilities,
  questionBanks = [],
  isLoadingQuestionBanks = false,
  onLoadQuestionBanks,
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
      quizEngine: draft.quizEngine ?? "classic",
      questions: draft.questions,
      questionBankGroups: draft.questionBankGroups ?? [],
    },
    mode: "onChange",
  });

  const { fields } = useFieldArray({ control, name: "questions" });
  const {
    fields: bankGroupFields,
    append: appendBankGroup,
    remove: removeBankGroup,
  } = useFieldArray({ control, name: "questionBankGroups" });

  const dueDateValue = useWatch({
    control,
    name: "dueDate",
    defaultValue: draft.dueDate,
  });
  const quizEngine = useWatch({
    control,
    name: "quizEngine",
    defaultValue: draft.quizEngine ?? "classic",
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

          <div className="space-y-2">
            <Label htmlFor="quiz-review-engine">Canvas quiz engine</Label>
            <select
              id="quiz-review-engine"
              className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
              {...register("quizEngine")}
            >
              <option value="classic">Classic Quiz</option>
              <option
                value="new_quizzes"
                disabled={!capabilities?.newQuizzes}
              >
                New Quiz
                {!capabilities?.newQuizzes ? " (unavailable)" : ""}
              </option>
            </select>
            <p className="text-sm text-muted-foreground">
              {quizEngine === "new_quizzes"
                ? "Uses Canvas New Quizzes and creates items through the New Quizzes API."
                : "Uses Canvas Classic Quizzes and supports linked question-bank groups."}
            </p>
            {quizEngine === "new_quizzes" &&
            fields.some(
              (question) =>
                question.questionType === "short_answer_question",
            ) ? (
              <p className="text-xs text-amber-700">
                Canvas New Quizzes has no direct Classic short-answer type;
                those prompts will be created as instructor-scored essay
                items.
              </p>
            ) : null}
            {!capabilities?.newQuizzes &&
            capabilities?.newQuizzesUnavailableReason ? (
              <p className="text-xs text-amber-700">
                {capabilities.newQuizzesUnavailableReason}
              </p>
            ) : null}
          </div>

          {quizEngine === "classic" ? (
            <div className="space-y-3 rounded-lg border border-border/70 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">Classic question banks</p>
                  <p className="text-xs text-muted-foreground">
                    Link a randomized group from an existing Canvas bank.
                  </p>
                </div>
                {onLoadQuestionBanks && questionBanks.length === 0 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isLoadingQuestionBanks}
                    onClick={onLoadQuestionBanks}
                  >
                    {isLoadingQuestionBanks
                      ? "Loading banks..."
                      : "Load question banks"}
                  </Button>
                ) : null}
              </div>

              {questionBanks.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {questionBanks.map((bank) => (
                    <Button
                      key={bank.id}
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={bankGroupFields.some(
                        (group) => group.bankId === bank.id,
                      )}
                      onClick={() =>
                        appendBankGroup({
                          bankId: bank.id,
                          bankName: bank.title,
                          pickCount: Math.max(
                            1,
                            Math.min(5, bank.questionCount || 5),
                          ),
                          questionPoints: 1,
                        })
                      }
                    >
                      Use {bank.title} ({bank.questionCount})
                    </Button>
                  ))}
                </div>
              ) : null}

              {bankGroupFields.map((field, index) => (
                <div
                  key={field.id}
                  className="grid gap-3 rounded-md bg-muted/30 p-3 sm:grid-cols-[1fr_110px_110px_auto]"
                >
                  <div>
                    <p className="text-sm font-medium">{field.bankName}</p>
                    <input
                      type="hidden"
                      {...register(`questionBankGroups.${index}.bankId`, {
                        valueAsNumber: true,
                      })}
                    />
                    <input
                      type="hidden"
                      {...register(`questionBankGroups.${index}.bankName`)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label
                      htmlFor={`quiz-bank-pick-${index}`}
                      className="text-xs"
                    >
                      Pick
                    </Label>
                    <Input
                      id={`quiz-bank-pick-${index}`}
                      type="number"
                      min="1"
                      {...register(`questionBankGroups.${index}.pickCount`, {
                        valueAsNumber: true,
                      })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label
                      htmlFor={`quiz-bank-points-${index}`}
                      className="text-xs"
                    >
                      Points each
                    </Label>
                    <Input
                      id={`quiz-bank-points-${index}`}
                      type="number"
                      min="0.1"
                      step="0.1"
                      {...register(
                        `questionBankGroups.${index}.questionPoints`,
                        { valueAsNumber: true },
                      )}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => removeBankGroup(index)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              {errors.questionBankGroups ? (
                <p role="alert" className="text-sm text-destructive">
                  {errors.questionBankGroups.message}
                </p>
              ) : null}
            </div>
          ) : null}

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
