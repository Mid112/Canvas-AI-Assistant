import { CheckCircle2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

import { CanvasConnectionRequired } from "@/components/common/CanvasConnectionRequired";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveCourse } from "@/contexts/useActiveCourse";
import { useInstitution } from "@/contexts/useInstitution";
import { useCanvasConnectionUrl } from "@/hooks/useCanvasConnectionUrl";
import { formatDueDateForDisplay } from "@/lib/assignment-utils";
import { disambiguateCourseLabels } from "@/lib/disambiguate-course-labels";
import { pageShellNarrow } from "@/lib/page-shell";
import type { AiActionDraftLocationState } from "@/routes/paths";
import {
  approveQuizDraft,
  generateQuizDraft,
  previewQuizDraft,
} from "@/services/quizCreator";
import type {
  GeneratedQuizDraft,
  QuizCreateCourseOption,
  QuizCreateStep,
  QuizDescribeValues,
  QuizPreviewSummary,
} from "@/types/quizCreate";

import { QuizCreateStepper } from "./InstructorQuizCreate/QuizCreateStepper";
import { QuizDescribeStep } from "./InstructorQuizCreate/QuizDescribeStep";
import { QuizPreviewDialog } from "./InstructorQuizCreate/QuizPreviewDialog";
import { QuizReviewApproveStep } from "./InstructorQuizCreate/QuizReviewApproveStep";
import type { QuizReviewFormSchema } from "./InstructorQuizCreate/quizCreateSchema";

const initialDescribeValues: QuizDescribeValues = {
  courseId: "",
  prompt: "",
};

export function InstructorQuizCreatePage() {
  const location = useLocation();
  const seededDraft = (location.state as AiActionDraftLocationState | null)
    ?.aiQuizDraft;
  const { accessToken, user } = useAuth();
  const [step, setStep] = useState<QuizCreateStep>(
    seededDraft ? "review" : "describe",
  );
  const [describeValues, setDescribeValues] =
    useState<QuizDescribeValues>(
      seededDraft
        ? {
            courseId: String(seededDraft.courseId ?? ""),
            prompt: "Drafted in the AI Assistant",
          }
        : initialDescribeValues,
    );
  const [draft, setDraft] = useState<GeneratedQuizDraft | null>(
    seededDraft
      ? {
          name: seededDraft.name ?? "",
          description: seededDraft.description ?? "",
          dueDate: seededDraft.dueDate ?? "",
          pointsPossible:
            typeof seededDraft.pointsPossible === "number"
              ? seededDraft.pointsPossible
              : 100,
          allowedAttempts:
            typeof seededDraft.allowedAttempts === "number"
              ? seededDraft.allowedAttempts
              : null,
          timeLimit:
            typeof seededDraft.timeLimit === "number"
              ? seededDraft.timeLimit
              : null,
          questions: seededDraft.questions ?? [],
        }
      : null,
  );
  const [approvedValues, setApprovedValues] =
    useState<QuizReviewFormSchema | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] =
    useState<QuizReviewFormSchema | null>(null);
  const [preview, setPreview] = useState<QuizPreviewSummary | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  const canvasUrl = useCanvasConnectionUrl();
  const {
    availableCourses,
    isLoading: isLoadingCourses,
    error: courseLoadError,
    needsCanvasConnection,
    refreshActiveCourse,
  } = useActiveCourse();
  const { refreshDashboard } = useInstitution();

  const writableCourses = useMemo(
    () => availableCourses.filter((course) => course.isWritable),
    [availableCourses],
  );
  const labelById = useMemo(
    () => disambiguateCourseLabels(writableCourses),
    [writableCourses],
  );
  const courseOptions: QuizCreateCourseOption[] = useMemo(
    () =>
      writableCourses.map((course) => ({
        id: String(course.id),
        label: labelById.get(course.id) ?? course.name,
      })),
    [labelById, writableCourses],
  );

  const courseLabel =
    courseOptions.find((course) => course.id === describeValues.courseId)
      ?.label ?? "your course";
  const effectiveCourseLoadError = needsCanvasConnection
    ? "Connect your Canvas account to load courses."
    : courseLoadError;

  const handleGenerate = async (values: QuizDescribeValues) => {
    if (!accessToken) {
      setGenerateError("Your session has expired. Please sign in again.");
      return;
    }

    setDescribeValues(values);
    setGenerateError(null);
    setIsGenerating(true);

    try {
      const courseId = Number(values.courseId);
      const generated = await generateQuizDraft(courseId, values.prompt, {
        accessToken,
        canvasUrl,
      });
      setDraft(generated);
      setStep("review");
    } catch (error) {
      setGenerateError(
        error instanceof Error
          ? error.message
          : "Unable to generate quiz. Please try again.",
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleBack = () => {
    setStep("describe");
    setApproveError(null);
  };

  const handleRequestApproval = async (values: QuizReviewFormSchema) => {
    if (!accessToken) {
      setApproveError("Your session has expired. Please sign in again.");
      return;
    }

    const payload = {
      courseId: describeValues.courseId,
      name: values.name,
      description: values.description,
      dueDate: values.dueDate,
      pointsPossible: values.pointsPossible,
      allowedAttempts: values.allowedAttempts,
      timeLimit: values.timeLimit,
      questions: values.questions,
    };

    setApproveError(null);
    setIsPreviewLoading(true);

    try {
      const previewSummary = await previewQuizDraft(payload, {
        accessToken,
        canvasUrl,
      });
      setPreview(previewSummary);
      setPendingApproval(values);
      setIsPreviewOpen(true);
    } catch (error) {
      setApproveError(
        error instanceof Error
          ? error.message
          : "Unable to preview this quiz. Please try again.",
      );
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleConfirmCreate = async () => {
    if (!accessToken || !pendingApproval) {
      setApproveError("Your session has expired. Please sign in again.");
      return;
    }

    setApproveError(null);
    setIsApproving(true);

    try {
      await approveQuizDraft(
        {
          courseId: describeValues.courseId,
          name: pendingApproval.name,
          description: pendingApproval.description,
          dueDate: pendingApproval.dueDate,
          pointsPossible: pendingApproval.pointsPossible,
          allowedAttempts: pendingApproval.allowedAttempts,
          timeLimit: pendingApproval.timeLimit,
          questions: pendingApproval.questions,
        },
        { accessToken, canvasUrl },
      );
      setApprovedValues(pendingApproval);
      setIsPreviewOpen(false);
      void refreshActiveCourse();
      void refreshDashboard();
    } catch (error) {
      setApproveError(
        error instanceof Error
          ? error.message
          : "Unable to create quiz. Please try again.",
      );
    } finally {
      setIsApproving(false);
    }
  };

  if (!user?.has_canvas_token) {
    return (
      <div className={pageShellNarrow}>
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">AI Quiz Creator</h1>
          <p className="text-sm text-muted-foreground">
            Generate Canvas quizzes with AI assistance.
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
    setPendingApproval(null);
    setPreview(null);
    setIsPreviewOpen(false);
  };

  if (approvedValues) {
    return (
      <div className={pageShellNarrow}>
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">AI Quiz Creator</h1>
          <p className="text-sm text-muted-foreground">
            Generate Canvas quizzes with AI assistance.
          </p>
        </header>

        <Card className="shadow-sm ring-1 ring-border/60">
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-3 text-green-700">
              <CheckCircle2 className="size-6" aria-hidden="true" />
              <CardTitle>Quiz Created</CardTitle>
            </div>
            <p className="text-sm text-muted-foreground">
              Your quiz has been created in Canvas as a draft.
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
            <div>
              <p className="font-medium">Questions</p>
              <p className="text-muted-foreground">{approvedValues.questions.length}</p>
            </div>
          </CardContent>
          <CardFooter className="border-t bg-transparent">
            <Button type="button" onClick={handleCreateAnother}>
              Create Another Quiz
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className={pageShellNarrow}>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">AI Quiz Creator</h1>
        <p className="text-sm text-muted-foreground">
          Generate Canvas quizzes with AI assistance.
        </p>
      </header>

      <QuizCreateStepper currentStep={step} />

      {step === "describe" ? (
        <QuizDescribeStep
          defaultValues={describeValues}
          isGenerating={isGenerating}
          generateError={generateError}
          courseOptions={courseOptions}
          courseLoadError={effectiveCourseLoadError}
          isLoadingCourses={isLoadingCourses}
          onGenerate={handleGenerate}
        />
      ) : draft ? (
        <QuizReviewApproveStep
          courseLabel={courseLabel}
          draft={draft}
          approveError={approveError}
          isApproving={isPreviewLoading}
          onApprove={handleRequestApproval}
          onBack={handleBack}
        />
      ) : null}

      <QuizPreviewDialog
        open={isPreviewOpen}
        onOpenChange={setIsPreviewOpen}
        preview={preview}
        isCreating={isApproving}
        onConfirm={() => void handleConfirmCreate()}
      />
    </div>
  );
}
