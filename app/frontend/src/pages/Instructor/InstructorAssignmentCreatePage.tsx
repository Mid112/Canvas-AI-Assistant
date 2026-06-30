import { CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";

import { CanvasConnectionRequired } from "@/components/common/CanvasConnectionRequired";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { formatDueDateForDisplay } from "@/lib/assignment-utils";
import { getPrimaryCanvasConnectionUrl } from "@/lib/canvas-connections";
import {
  approveAssignmentDraft,
  generateAssignmentDraft,
} from "@/services/assignmentCreator";
import { CanvasApiError, fetchCourses } from "@/services/canvas";
import type {
  AssignmentCreateCourseOption,
  AssignmentCreateStep,
  AssignmentDescribeValues,
  GeneratedAssignmentDraft,
} from "@/types/assignmentCreate";

import { AssignmentCreateStepper } from "./InstructorAssignmentCreate/AssignmentCreateStepper";
import { AssignmentDescribeStep } from "./InstructorAssignmentCreate/AssignmentDescribeStep";
import { AssignmentReviewApproveStep } from "./InstructorAssignmentCreate/AssignmentReviewApproveStep";
import type { AssignmentReviewFormSchema } from "./InstructorAssignmentCreate/assignmentCreateSchema";

const initialDescribeValues: AssignmentDescribeValues = {
  courseId: "",
  prompt: "",
};

export function InstructorAssignmentCreatePage() {
  const { accessToken, user } = useAuth();
  const [step, setStep] = useState<AssignmentCreateStep>("describe");
  const [describeValues, setDescribeValues] =
    useState<AssignmentDescribeValues>(initialDescribeValues);
  const [draft, setDraft] = useState<GeneratedAssignmentDraft | null>(null);
  const [approvedValues, setApprovedValues] =
    useState<AssignmentReviewFormSchema | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [courseOptions, setCourseOptions] = useState<AssignmentCreateCourseOption[]>([]);
  const [isLoadingCourses, setIsLoadingCourses] = useState(false);
  const [courseLoadError, setCourseLoadError] = useState<string | null>(null);

  const courseLabel =
    courseOptions.find((course) => course.id === describeValues.courseId)
      ?.label ?? "your course";
  const canvasUrl = getPrimaryCanvasConnectionUrl(user);

  useEffect(() => {
    if (!accessToken || !user?.has_canvas_token) {
      return;
    }

    const token = accessToken;
    const selectedCanvasUrl = canvasUrl;
    let cancelled = false;

    async function loadCourses() {
      setIsLoadingCourses(true);

      try {
        const courses = await fetchCourses(token, selectedCanvasUrl);
        if (cancelled) {
          return;
        }

        setCourseOptions(
          courses
            .filter((course) => course.local_id !== null)
            .map((course) => ({
              id: String(course.local_id),
              label: `${course.course_code}: ${course.name}`,
            })),
        );
        setCourseLoadError(null);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setCourseOptions([]);
        setCourseLoadError(
          error instanceof CanvasApiError
            ? error.message
            : "Unable to load courses from Canvas.",
        );
      } finally {
        if (!cancelled) {
          setIsLoadingCourses(false);
        }
      }
    }

    void loadCourses();

    return () => {
      cancelled = true;
    };
  }, [accessToken, canvasUrl, user?.has_canvas_token]);

  const handleGenerate = async (values: AssignmentDescribeValues) => {
    setDescribeValues(values);
    setGenerateError(null);
    setIsGenerating(true);

    try {
      const generated = await generateAssignmentDraft(values.prompt);
      setDraft(generated);
      setStep("review");
    } catch (error) {
      setGenerateError(
        error instanceof Error
          ? error.message
          : "Unable to generate assignment. Please try again.",
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleBack = () => {
    setStep("describe");
    setApproveError(null);
  };

  const handleApprove = async (values: AssignmentReviewFormSchema) => {
    if (!accessToken) {
      setApproveError("Your session has expired. Please sign in again.");
      return;
    }

    setApproveError(null);
    setIsApproving(true);

    try {
      await approveAssignmentDraft({
        courseId: describeValues.courseId,
        name: values.name,
        description: values.description,
        dueDate: values.dueDate,
      }, {
        accessToken,
        canvasUrl,
      });
      setApprovedValues(values);
    } catch (error) {
      setApproveError(
        error instanceof Error
          ? error.message
          : "Unable to approve assignment. Please try again.",
      );
    } finally {
      setIsApproving(false);
    }
  };

  if (!user?.has_canvas_token) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            AI Assignment Creator
          </h1>
          <p className="text-sm text-muted-foreground">
            Generate assignments with AI assistance.
          </p>
        </header>
        <CanvasConnectionRequired />
      </div>
    );
  }

  const handleCreateAnother = () => {
    setStep("describe");
    setDescribeValues(initialDescribeValues);
    setDraft(null);
    setApprovedValues(null);
    setGenerateError(null);
    setApproveError(null);
  };

  if (approvedValues) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            AI Assignment Creator
          </h1>
          <p className="text-sm text-muted-foreground">
            Generate assignments with AI assistance.
          </p>
        </header>

        <Card className="shadow-sm ring-1 ring-border/60">
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-3 text-green-700">
              <CheckCircle2 className="size-6" aria-hidden="true" />
              <CardTitle>Assignment Approved</CardTitle>
            </div>
            <p className="text-sm text-muted-foreground">
              Your assignment has been approved and is ready to publish to Canvas.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="font-medium">Course</p>
              <p className="text-muted-foreground">{courseLabel}</p>
            </div>
            <div>
              <p className="font-medium">Title</p>
              <p className="text-muted-foreground">{approvedValues.name}</p>
            </div>
            <div>
              <p className="font-medium">Due date</p>
              <p className="text-muted-foreground">
                {formatDueDateForDisplay(approvedValues.dueDate)}
              </p>
            </div>
          </CardContent>
          <CardFooter className="border-t bg-transparent">
            <Button type="button" onClick={handleCreateAnother}>
              Create Another Assignment
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">AI Assignment Creator</h1>
        <p className="text-sm text-muted-foreground">
          Generate assignments with AI assistance.
        </p>
      </header>

      <AssignmentCreateStepper currentStep={step} />

      {step === "describe" ? (
        <AssignmentDescribeStep
          defaultValues={describeValues}
          isGenerating={isGenerating}
          generateError={generateError}
          courseOptions={courseOptions}
          courseLoadError={courseLoadError}
          isLoadingCourses={isLoadingCourses}
          onGenerate={handleGenerate}
        />
      ) : draft ? (
        <AssignmentReviewApproveStep
          courseLabel={courseLabel}
          draft={draft}
          approveError={approveError}
          isApproving={isApproving}
          onApprove={handleApprove}
          onBack={handleBack}
        />
      ) : null}
    </div>
  );
}
