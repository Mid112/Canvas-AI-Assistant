import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { feedbackCreateSuggestedPrompts } from "@/data/mockFeedbackCreator";
import { cn } from "@/lib/utils";
import { dashboardColors } from "@/pages/Instructor/InstructorDashboard/dashboardColors";
import { fetchCourseAssignments } from "@/services/assignments";
import { fetchCourseStudents } from "@/services/students";
import type {
  FeedbackAssignmentOption,
  FeedbackCreateCourseOption,
  FeedbackDescribeValues,
  FeedbackStudentOption,
} from "@/types/feedbackCreate";

import {
  feedbackDescribeSchema,
  type FeedbackDescribeFormSchema,
} from "./feedbackCreateSchema";

interface FeedbackDescribeStepProps {
  defaultValues: FeedbackDescribeValues;
  accessToken: string;
  canvasUrl?: string;
  isGenerating: boolean;
  generateError?: string | null;
  courseOptions: FeedbackCreateCourseOption[];
  courseLoadError?: string | null;
  isLoadingCourses?: boolean;
  onGenerate: (values: FeedbackDescribeValues) => void;
}

const selectClassName = cn(
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs",
  "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

export function FeedbackDescribeStep({
  defaultValues,
  accessToken,
  canvasUrl,
  isGenerating,
  generateError,
  courseOptions,
  courseLoadError = null,
  isLoadingCourses = false,
  onGenerate,
}: FeedbackDescribeStepProps) {
  const [assignments, setAssignments] = useState<FeedbackAssignmentOption[]>([]);
  const [students, setStudents] = useState<FeedbackStudentOption[]>([]);
  const [contextError, setContextError] = useState<string | null>(null);
  const [isLoadingContext, setIsLoadingContext] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors, isValid },
  } = useForm<FeedbackDescribeFormSchema>({
    resolver: zodResolver(feedbackDescribeSchema),
    defaultValues,
    mode: "onChange",
  });

  const courseId = useWatch({ control, name: "courseId", defaultValue: defaultValues.courseId });
  const promptValue = useWatch({ control, name: "prompt", defaultValue: defaultValues.prompt });

  useEffect(() => {
    if (!courseId || !accessToken) {
      setAssignments([]);
      setStudents([]);
      return;
    }

    let cancelled = false;
    setIsLoadingContext(true);
    setContextError(null);

    void Promise.all([
      fetchCourseAssignments(Number(courseId), accessToken, canvasUrl),
      fetchCourseStudents(Number(courseId), accessToken, canvasUrl),
    ])
      .then(([assignmentRows, studentRows]) => {
        if (cancelled) {
          return;
        }
        setAssignments(
          assignmentRows.map((assignment) => ({
            id: assignment.id,
            name: assignment.name,
          })),
        );
        setStudents(
          studentRows.map((student) => ({
            id: Number(student.canvas_user_id),
            name: student.name,
          })),
        );
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setContextError(
          error instanceof Error
            ? error.message
            : "Unable to load assignments and students for this course.",
        );
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingContext(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, canvasUrl, courseId]);

  const applySuggestedPrompt = (text: string) => {
    setValue("prompt", text, { shouldValidate: true, shouldDirty: true });
  };

  const handleSubmitForm = handleSubmit((values) => {
    const assignmentName =
      assignments.find((assignment) => String(assignment.id) === values.assignmentId)
        ?.name ?? "";
    const studentName =
      students.find((student) => String(student.id) === values.studentId)?.name ??
      "";
    onGenerate({
      ...values,
      assignmentName,
      studentName,
    });
  });

  return (
    <Card className="shadow-sm ring-1 ring-border/60">
      <CardHeader>
        <CardTitle>Describe the Feedback</CardTitle>
        <p className="text-sm text-muted-foreground">
          Choose the course, assignment, and student, then describe the feedback
          you want the AI to draft.
        </p>
      </CardHeader>
      <form onSubmit={handleSubmitForm} noValidate>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="feedback-course">Select Course</Label>
            <select
              id="feedback-course"
              className={selectClassName}
              aria-invalid={Boolean(errors.courseId)}
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
              <p role="alert" className="text-sm text-destructive">
                {errors.courseId.message}
              </p>
            ) : null}
            {courseLoadError ? (
              <p role="alert" className="text-sm text-destructive">
                {courseLoadError}
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="feedback-assignment">Assignment</Label>
              <select
                id="feedback-assignment"
                className={selectClassName}
                aria-invalid={Boolean(errors.assignmentId)}
                disabled={!courseId || isLoadingContext}
                {...register("assignmentId")}
              >
                <option value="">
                  {isLoadingContext ? "Loading assignments..." : "Choose assignment..."}
                </option>
                {assignments.map((assignment) => (
                  <option key={assignment.id} value={String(assignment.id)}>
                    {assignment.name}
                  </option>
                ))}
              </select>
              {errors.assignmentId ? (
                <p role="alert" className="text-sm text-destructive">
                  {errors.assignmentId.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="feedback-student">Student</Label>
              <select
                id="feedback-student"
                className={selectClassName}
                aria-invalid={Boolean(errors.studentId)}
                disabled={!courseId || isLoadingContext}
                {...register("studentId")}
              >
                <option value="">
                  {isLoadingContext ? "Loading students..." : "Choose student..."}
                </option>
                {students.map((student) => (
                  <option key={student.id} value={String(student.id)}>
                    {student.name}
                  </option>
                ))}
              </select>
              {errors.studentId ? (
                <p role="alert" className="text-sm text-destructive">
                  {errors.studentId.message}
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback-prompt">Feedback prompt</Label>
            <Textarea
              id="feedback-prompt"
              rows={6}
              placeholder="Example: Draft feedback for a student who solved the recursion problem correctly but did not explain the base case clearly."
              aria-invalid={Boolean(errors.prompt)}
              {...register("prompt")}
            />
            {errors.prompt ? (
              <p role="alert" className="text-sm text-destructive">
                {errors.prompt.message}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Include what the student did well, what needs improvement, and
                the tone you want.
              </p>
            )}
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">Suggested prompts</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {feedbackCreateSuggestedPrompts.map((suggestion) => (
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

          {contextError ? (
            <p role="alert" className="text-sm text-destructive">
              {contextError}
            </p>
          ) : null}
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
            disabled={!isValid || isGenerating || isLoadingContext}
          >
            {isGenerating ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Generating Feedback...
              </>
            ) : (
              "Generate Feedback"
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
