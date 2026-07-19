import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { quizCreateSuggestedPrompts } from "@/data/mockQuizCreator";
import { cn } from "@/lib/utils";
import { dashboardColors } from "@/pages/Instructor/InstructorDashboard/dashboardColors";
import type {
  QuizCreateCourseOption,
  QuizDescribeValues,
} from "@/types/quizCreate";

import {
  quizDescribeSchema,
  type QuizDescribeFormSchema,
} from "./quizCreateSchema";

interface QuizDescribeStepProps {
  defaultValues: QuizDescribeValues;
  isGenerating: boolean;
  generateError?: string | null;
  courseOptions?: QuizCreateCourseOption[];
  courseLoadError?: string | null;
  isLoadingCourses?: boolean;
  onGenerate: (values: QuizDescribeValues) => void;
}

const selectClassName = cn(
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs",
  "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

export function QuizDescribeStep({
  defaultValues,
  isGenerating,
  generateError,
  courseOptions = [],
  courseLoadError = null,
  isLoadingCourses = false,
  onGenerate,
}: QuizDescribeStepProps) {
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors, isValid },
  } = useForm<QuizDescribeFormSchema>({
    resolver: zodResolver(quizDescribeSchema),
    defaultValues,
    mode: "onChange",
  });

  const promptValue = useWatch({
    control,
    name: "prompt",
    defaultValue: defaultValues.prompt,
  });

  const applySuggestedPrompt = (text: string) => {
    setValue("prompt", text, { shouldValidate: true, shouldDirty: true });
  };

  return (
    <Card className="shadow-sm ring-1 ring-border/60">
      <CardHeader>
        <CardTitle>Describe Your Quiz</CardTitle>
        <p className="text-sm text-muted-foreground">
          Tell the AI what kind of quiz you want to create. Mention topics,
          question types, and difficulty.
        </p>
      </CardHeader>
      <form onSubmit={handleSubmit(onGenerate)} noValidate>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="quiz-course">Course</Label>
            <select
              id="quiz-course"
              className={selectClassName}
              disabled={isLoadingCourses || Boolean(courseLoadError)}
              aria-invalid={Boolean(errors.courseId)}
              {...register("courseId")}
            >
              <option value="">
                {isLoadingCourses ? "Loading courses..." : "Select a course"}
              </option>
              {courseOptions.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.label}
                </option>
              ))}
            </select>
            {courseLoadError ? (
              <p role="alert" className="text-sm text-destructive">
                {courseLoadError}
              </p>
            ) : null}
            {errors.courseId ? (
              <p role="alert" className="text-sm text-destructive">
                {errors.courseId.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="quiz-prompt">Quiz description</Label>
            <Textarea
              id="quiz-prompt"
              rows={6}
              placeholder="e.g. Create a quiz on Python functions with 4 multiple-choice questions due next Friday"
              aria-invalid={Boolean(errors.prompt)}
              {...register("prompt")}
            />
            <p className="text-xs text-muted-foreground">
              {promptValue?.length ?? 0} characters
            </p>
            {errors.prompt ? (
              <p role="alert" className="text-sm text-destructive">
                {errors.prompt.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Suggested prompts</p>
            <div className="flex flex-wrap gap-2">
              {quizCreateSuggestedPrompts.map((suggestion) => (
                <Button
                  key={suggestion.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applySuggestedPrompt(suggestion.text)}
                >
                  {suggestion.text}
                </Button>
              ))}
            </div>
          </div>

          {generateError ? (
            <p role="alert" className="text-sm text-destructive">
              {generateError}
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="border-t bg-transparent">
          <Button
            type="submit"
            className={cn(dashboardColors.blue.button)}
            disabled={isGenerating || !isValid}
          >
            {isGenerating ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Generating...
              </>
            ) : (
              "Generate Quiz Draft"
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
