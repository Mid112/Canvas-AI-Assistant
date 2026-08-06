// Instructor page note: coordinates instructor feedback create page UI state with Canvas-backed services and active-course context.

import { CheckCircle2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

import { CanvasConnectionRequired } from "@/components/common/CanvasConnectionRequired";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveCourse } from "@/contexts/useActiveCourse";
import { useInstitution } from "@/contexts/useInstitution";
import { useCanvasConnectionUrl } from "@/hooks/useCanvasConnectionUrl";
import { disambiguateCourseLabels } from "@/lib/disambiguate-course-labels";
import { pageShellNarrow } from "@/lib/page-shell";
import {
  discardTypedDraft,
  saveTypedDraft,
} from "@/lib/typed-draft-storage";
import type { AiActionDraftLocationState } from "@/routes/paths";
import {
  approveFeedbackDraft,
  generateFeedbackDraft,
  previewFeedbackDraft,
} from "@/services/feedbackCreator";
import type {
  FeedbackCreateCourseOption,
  FeedbackCreateStep,
  FeedbackDescribeValues,
  FeedbackPreviewSummary,
  GeneratedFeedbackDraft,
} from "@/types/feedbackCreate";

import { FeedbackCreateStepper } from "./InstructorFeedbackCreate/FeedbackCreateStepper";
import { FeedbackDescribeStep } from "./InstructorFeedbackCreate/FeedbackDescribeStep";
import { FeedbackPreviewDialog } from "./InstructorFeedbackCreate/FeedbackPreviewDialog";
import { FeedbackReviewApproveStep } from "./InstructorFeedbackCreate/FeedbackReviewApproveStep";
import type { FeedbackReviewFormSchema } from "./InstructorFeedbackCreate/feedbackCreateSchema";

const initialDescribeValues: FeedbackDescribeValues = {
  courseId: "",
  assignmentId: "",
  studentId: "",
  assignmentName: "",
  studentName: "",
  prompt: "",
};

export function InstructorFeedbackCreatePage() {
  const location = useLocation();
  const locationState = location.state as AiActionDraftLocationState | null;
  const seededDraft = locationState?.aiFeedbackDraft;
  const typedDraftId = locationState?.typedDraftId;
  const hasValidFeedbackIds =
    typeof seededDraft?.assignmentId === "number" &&
    Number.isFinite(seededDraft.assignmentId) &&
    typeof seededDraft?.studentId === "number" &&
    Number.isFinite(seededDraft.studentId);
  const { accessToken, user } = useAuth();
  const [step, setStep] = useState<FeedbackCreateStep>(
    hasValidFeedbackIds ? "review" : "describe",
  );
  const [describeValues, setDescribeValues] = useState<FeedbackDescribeValues>(
    seededDraft
      ? {
          courseId: String(seededDraft.courseId ?? ""),
          assignmentId: hasValidFeedbackIds
            ? String(seededDraft.assignmentId)
            : "",
          studentId: hasValidFeedbackIds ? String(seededDraft.studentId) : "",
          assignmentName: seededDraft.assignmentName ?? "",
          studentName: seededDraft.studentName ?? "",
          prompt: hasValidFeedbackIds
            ? "Drafted in the AI Assistant"
            : seededDraft.prompt?.trim() ||
              [
                seededDraft.assignmentName
                  ? `Assignment: ${seededDraft.assignmentName}`
                  : "",
                seededDraft.studentName
                  ? `Student: ${seededDraft.studentName}`
                  : "",
                seededDraft.newGrade ? `Grade: ${seededDraft.newGrade}` : "",
                seededDraft.feedback ?? "",
              ]
                .map((part) => part.trim())
                .filter(Boolean)
                .join("\n\n"),
        }
      : initialDescribeValues,
  );
  const [draft, setDraft] = useState<GeneratedFeedbackDraft | null>(
    hasValidFeedbackIds && seededDraft
      ? {
          assignmentId: seededDraft.assignmentId as number,
          studentId: seededDraft.studentId as number,
          assignmentName: seededDraft.assignmentName ?? "Assignment",
          studentName: seededDraft.studentName ?? "Student",
          newGrade: String(seededDraft.newGrade ?? ""),
          feedback: String(seededDraft.feedback ?? ""),
        }
      : null,
  );
  const [approvedValues, setApprovedValues] =
    useState<FeedbackReviewFormSchema | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] =
    useState<FeedbackReviewFormSchema | null>(null);
  const [preview, setPreview] = useState<FeedbackPreviewSummary | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [draftSaveStatus, setDraftSaveStatus] = useState<string | null>(null);
  const [savedTypedDraftId, setSavedTypedDraftId] = useState<string | undefined>(
    typedDraftId,
  );

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
  const courseOptions: FeedbackCreateCourseOption[] = useMemo(
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
  // Persisted with saved drafts so resuming targets this course rather than
  // whatever is active later. Labels only — see TypedDraftContent (#1239).
  const selectedCourse = writableCourses.find(
    (course) => String(course.id) === describeValues.courseId,
  );

  const handleReviewDraftChange = useCallback((values: GeneratedFeedbackDraft) => {
    setDraft((current) => {
      if (
        current &&
        current.assignmentId === values.assignmentId &&
        current.studentId === values.studentId &&
        current.assignmentName === values.assignmentName &&
        current.studentName === values.studentName &&
        current.newGrade === values.newGrade &&
        current.feedback === values.feedback
      ) {
        return current;
      }
      return values;
    });
  }, []);

  const handleDescribeValuesChange = useCallback((values: FeedbackDescribeValues) => {
    setDescribeValues((current) =>
      current.courseId === values.courseId &&
      current.assignmentId === values.assignmentId &&
      current.studentId === values.studentId &&
      current.assignmentName === values.assignmentName &&
      current.studentName === values.studentName &&
      current.prompt === values.prompt
        ? current
        : values,
    );
  }, []);

  const handleSaveTypedDraft = () => {
    if (!user?.id) return;
    const content = draft
      ? {
          assignmentName: draft.assignmentName,
          studentName: draft.studentName,
          grade: draft.newGrade,
          feedback: draft.feedback,
        }
      : describeValues.prompt.trim()
        ? {
            assignmentName: describeValues.assignmentName || undefined,
            studentName: describeValues.studentName || undefined,
            feedback: describeValues.prompt.trim(),
          }
        : null;
    if (
      !content ||
      (!content.feedback?.trim() &&
        !content.assignmentName?.trim() &&
        !content.studentName?.trim() &&
        !content.grade?.trim())
    ) {
      setDraftSaveStatus("Add feedback details before saving a draft.");
      return;
    }
    const saved = saveTypedDraft(user.id, {
      id: savedTypedDraftId,
      kind: "feedback",
      content: {
        ...content,
        ...(selectedCourse
          ? { courseCode: selectedCourse.code, courseName: selectedCourse.name }
          : {}),
      },
    });
    setSavedTypedDraftId(saved.id);
    setDraftSaveStatus("Draft saved. Resume it anytime from the assistant.");
  };

  const handleGenerate = async (values: FeedbackDescribeValues) => {
    if (!accessToken) {
      setGenerateError("Your session has expired. Please sign in again.");
      return;
    }

    setDescribeValues(values);
    setGenerateError(null);
    setIsGenerating(true);

    try {
      const generated = await generateFeedbackDraft(
        Number(values.courseId),
        values,
        {
          accessToken,
          canvasUrl,
          assignmentName: values.assignmentName,
          studentName: values.studentName,
        },
      );
      setDraft(generated);
      setStep("review");
    } catch (error) {
      setGenerateError(
        error instanceof Error
          ? error.message
          : "Unable to generate feedback. Please try again.",
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleBack = () => {
    setStep("describe");
    setApproveError(null);
  };

  const handleRequestApproval = async (values: FeedbackReviewFormSchema) => {
    if (!accessToken || !draft) {
      setApproveError("Your session has expired. Please sign in again.");
      return;
    }

    setApproveError(null);
    setIsPreviewLoading(true);

    try {
      const previewSummary = await previewFeedbackDraft(
        {
          courseId: describeValues.courseId,
          assignmentId: draft.assignmentId,
          studentId: draft.studentId,
          assignmentName: values.assignmentName,
          studentName: values.studentName,
          newGrade: values.newGrade,
          feedback: values.feedback,
        },
        { accessToken, canvasUrl },
      );
      setPreview(previewSummary);
      setPendingApproval(values);
      setIsPreviewOpen(true);
    } catch (error) {
      setApproveError(
        error instanceof Error
          ? error.message
          : "Unable to preview this feedback. Please try again.",
      );
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleConfirmPost = async () => {
    if (!accessToken || !pendingApproval || !draft) {
      setApproveError("Your session has expired. Please sign in again.");
      return;
    }

    setApproveError(null);
    setIsPosting(true);

    try {
      await approveFeedbackDraft(
        {
          courseId: describeValues.courseId,
          assignmentId: draft.assignmentId,
          studentId: draft.studentId,
          assignmentName: pendingApproval.assignmentName,
          studentName: pendingApproval.studentName,
          newGrade: pendingApproval.newGrade,
          feedback: pendingApproval.feedback,
        },
        {
          accessToken,
          canvasUrl,
          conversationId: seededDraft?.conversationId,
        },
      );
      if (user?.id && savedTypedDraftId) {
        discardTypedDraft(user.id, savedTypedDraftId);
        setSavedTypedDraftId(undefined);
      }
      setApprovedValues(pendingApproval);
      setIsPreviewOpen(false);
      void refreshActiveCourse();
      void refreshDashboard();
    } catch (error) {
      setApproveError(
        error instanceof Error
          ? error.message
          : "Unable to post feedback. Please try again.",
      );
    } finally {
      setIsPosting(false);
    }
  };

  if (!user?.has_canvas_token) {
    return (
      <div className={pageShellNarrow}>
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            AI Feedback Creator
          </h1>
          <p className="text-sm text-muted-foreground">
            Generate submission feedback with AI assistance.
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
    setDraftSaveStatus(null);
    setSavedTypedDraftId(undefined);
  };

  if (approvedValues && draft) {
    return (
      <div className={pageShellNarrow}>
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            AI Feedback Creator
          </h1>
          <p className="text-sm text-muted-foreground">
            Generate submission feedback with AI assistance.
          </p>
        </header>

        <Card className="shadow-sm ring-1 ring-border/60">
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-3 text-green-700">
              <CheckCircle2 className="size-6" aria-hidden="true" />
              <CardTitle>Feedback Posted</CardTitle>
            </div>
            <p className="text-sm text-muted-foreground">
              Grade and feedback were posted to Canvas for {approvedValues.studentName}.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="font-medium">Course</p>
              <p className="text-muted-foreground">{courseLabel}</p>
            </div>
            <div>
              <p className="font-medium">Assignment</p>
              <p className="text-muted-foreground">{approvedValues.assignmentName}</p>
            </div>
            <div>
              <p className="font-medium">Grade</p>
              <p className="text-muted-foreground">{approvedValues.newGrade}</p>
            </div>
          </CardContent>
          <CardFooter className="border-t bg-transparent">
            <Button type="button" onClick={handleCreateAnother}>
              Create Another Feedback
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className={pageShellNarrow}>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">AI Feedback Creator</h1>
        <p className="text-sm text-muted-foreground">
          Generate submission feedback with AI assistance.
        </p>
      </header>

      <FeedbackCreateStepper currentStep={step} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="outline" size="sm" onClick={handleSaveTypedDraft}>
          Save draft
        </Button>
        {draftSaveStatus ? (
          <p role="status" className="text-sm text-muted-foreground">
            {draftSaveStatus}
          </p>
        ) : null}
      </div>

      {step === "describe" ? (
        <FeedbackDescribeStep
          defaultValues={describeValues}
          accessToken={accessToken ?? ""}
          canvasUrl={canvasUrl}
          isGenerating={isGenerating}
          generateError={generateError}
          courseOptions={courseOptions}
          courseLoadError={
            needsCanvasConnection
              ? "Connect your Canvas account to load courses."
              : courseLoadError
          }
          isLoadingCourses={isLoadingCourses}
          onGenerate={handleGenerate}
          onValuesChange={handleDescribeValuesChange}
        />
      ) : draft ? (
        <FeedbackReviewApproveStep
          courseLabel={courseLabel}
          draft={draft}
          approveError={approveError}
          isApproving={isPreviewLoading}
          onApprove={handleRequestApproval}
          onBack={handleBack}
          onDraftChange={handleReviewDraftChange}
        />
      ) : null}

      <FeedbackPreviewDialog
        open={isPreviewOpen}
        onOpenChange={setIsPreviewOpen}
        preview={preview}
        isPosting={isPosting}
        onConfirm={() => void handleConfirmPost()}
      />
    </div>
  );
}
