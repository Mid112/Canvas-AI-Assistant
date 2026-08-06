// Instructor page note: coordinates assignment describe step UI state with Canvas-backed services and active-course context.

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { looksLikeQuizRequest } from "@/lib/quiz-intent";
import { cn } from "@/lib/utils";
import { dashboardColors } from "@/pages/Instructor/InstructorDashboard/dashboardColors";
import {
  assignmentCreateCourseOptions,
  assignmentCreateSuggestedPrompts,
} from "@/data/mockAssignmentCreator";
import type {
  AssignmentCreateCourseOption,
  AssignmentDescribeValues,
} from "@/types/assignmentCreate";

import {
  assignmentDescribeSchema,
  type AssignmentDescribeFormSchema,
} from "./assignmentCreateSchema";

interface AssignmentDescribeStepProps {
  defaultValues: AssignmentDescribeValues;
  isGenerating: boolean;
  generateError?: string | null;
  courseOptions?: AssignmentCreateCourseOption[];
  courseLoadError?: string | null;
  isLoadingCourses?: boolean;
  onGenerate: (values: AssignmentDescribeValues) => void;
  /** Keep parent describe state in sync (for Save draft before generate). */
  onValuesChange?: (values: AssignmentDescribeValues) => void;
  /** Offered when the prompt reads like a quiz. The page owns navigation; this
   * step only decides when to surface the option. Omit to suppress it. */
  onSwitchToQuiz?: (prompt: string) => void;
}

const selectClassName = cn(
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs",
  "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

export function AssignmentDescribeStep({
  defaultValues,
  isGenerating,
  generateError,
  courseOptions = assignmentCreateCourseOptions,
  courseLoadError = null,
  isLoadingCourses = false,
  onGenerate,
  onValuesChange,
  onSwitchToQuiz,
}: AssignmentDescribeStepProps) {
  const [quizSuggestionDismissed, setQuizSuggestionDismissed] = useState(false);
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors, isValid },
  } = useForm<AssignmentDescribeFormSchema>({
    resolver: zodResolver(assignmentDescribeSchema),
    defaultValues,
    mode: "onChange",
  });

  const watchedValues = useWatch({ control });
  const promptValue = useWatch({
    control,
    name: "prompt",
    defaultValue: defaultValues.prompt,
  });

  useEffect(() => {
    if (!onValuesChange) return;
    onValuesChange({
      courseId: String(watchedValues.courseId ?? ""),
      prompt: String(watchedValues.prompt ?? ""),
    });
  }, [onValuesChange, watchedValues]);

  const applySuggestedPrompt = (text: string) => {
    setValue("prompt", text, { shouldValidate: true, shouldDirty: true });
  };

  const showQuizSuggestion =
    Boolean(onSwitchToQuiz) &&
    !quizSuggestionDismissed &&
    looksLikeQuizRequest(String(promptValue ?? ""));

  return (
    <Card className="shadow-sm ring-1 ring-border/60">
      <CardHeader>
        <CardTitle>Describe Your Assignment</CardTitle>
        <p className="text-sm text-muted-foreground">
          Tell the AI what kind of assignment you want to create. Be specific about
          topics, difficulty, and learning objectives.
        </p>
      </CardHeader>
      <form onSubmit={handleSubmit(onGenerate)} noValidate>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="assignment-course">Select Course</Label>
            <select
              id="assignment-course"
              className={selectClassName}
              aria-invalid={Boolean(errors.courseId)}
              aria-describedby={errors.courseId ? "assignment-course-error" : undefined}
              disabled={isLoadingCourses}
              {...register("courseId")}
            >
              <option value="">
                {isLoadingCourses ? "Loading courses..." : "Choose a course..."}
              </option>
              {courseOptions.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.label}
                </option>
              ))}
            </select>
            {errors.courseId ? (
              <p
                id="assignment-course-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {errors.courseId.message}
              </p>
            ) : null}
            {courseLoadError ? (
              <p role="alert" className="text-sm text-destructive">
                {courseLoadError}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="assignment-prompt">Assignment Prompt</Label>
            <Textarea
              id="assignment-prompt"
              rows={6}
              placeholder="Example: Create a programming assignment about arrays and sorting algorithms for beginner students. Should take about 2 hours to complete and test their understanding of algorithmic complexity."
              aria-invalid={Boolean(errors.prompt)}
              aria-describedby={errors.prompt ? "assignment-prompt-error" : undefined}
              {...register("prompt")}
            />
            {errors.prompt ? (
              <p
                id="assignment-prompt-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {errors.prompt.message}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Tip: Include details about difficulty level, time commitment, and
                specific topics to cover.
              </p>
            )}

            {/* A quiz prompt typed here would otherwise be rendered as prose
                into the assignment description — reading like a quiz but
                producing nothing Canvas can administer. Offered, never
                automatic: an assignment that legitimately describes a quiz is
                a real thing to want. */}
            {showQuizSuggestion ? (
              <div
                role="status"
                className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
              >
                <span>
                  This looks like a quiz. The Quiz Creator makes real question
                  items; this page would put them in the description text.
                </span>
                <span className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => onSwitchToQuiz?.(promptValue ?? "")}
                  >
                    Switch to Quiz Creator
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setQuizSuggestionDismissed(true)}
                  >
                    Dismiss
                  </Button>
                </span>
              </div>
            ) : null}
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">Suggested Prompts</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {assignmentCreateSuggestedPrompts.map((suggestion) => (
                <button
                  key={suggestion.id}
                  type="button"
                  onClick={() => applySuggestedPrompt(suggestion.text)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                    "hover:border-primary/30 hover:bg-primary/5",
                    promptValue === suggestion.text
                      ? "border-primary bg-primary/10"
                      : "border-border bg-background",
                  )}
                >
                  {suggestion.text}
                </button>
              ))}
            </div>
          </div>

          {generateError ? (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {generateError}
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="justify-center border-t bg-transparent">
          <Button
            type="submit"
            size="lg"
            className={cn("w-full max-w-md", dashboardColors.blue.button)}
            disabled={!isValid || isGenerating}
          >
            {isGenerating ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Generating Assignment...
              </>
            ) : (
              "Generate Assignment"
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
