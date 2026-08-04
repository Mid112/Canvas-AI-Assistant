import { CheckCircle2, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";

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
import {
  discardTypedDraft,
  saveTypedDraft,
} from "@/lib/typed-draft-storage";
import {
  instructorCourseQuizzesPath,
  type AiActionDraftLocationState,
} from "@/routes/paths";
import {
  approveQuizDraft,
  fetchQuestionBanks,
  fetchQuizCapabilities,
  generateQuizDraft,
  previewQuizDraft,
} from "@/services/quizCreator";
import { QuizApiError, setQuizPublished } from "@/services/quizzes";
import type {
  GeneratedQuizDraft,
  QuizCreateCourseOption,
  QuizCreateStep,
  QuizCapabilities,
  QuizDescribeValues,
  QuizPreviewSummary,
  QuizQuestionBank,
} from "@/types/quizCreate";
import type { QuizEngine } from "@/types/quiz";

import { QuizCreateStepper } from "./InstructorQuizCreate/QuizCreateStepper";
import { QuizDescribeStep } from "./InstructorQuizCreate/QuizDescribeStep";
import { QuizPreviewDialog } from "./InstructorQuizCreate/QuizPreviewDialog";
import { QuizReviewApproveStep } from "./InstructorQuizCreate/QuizReviewApproveStep";
import type { QuizReviewFormSchema } from "./InstructorQuizCreate/quizCreateSchema";

const initialDescribeValues: QuizDescribeValues = {
  courseId: "",
  prompt: "",
};

/** Reads an attempt limit / time limit out of untyped location state.
 *
 * Three-way on purpose. undefined means the draft never carried the setting
 * and the generator's value should stand; null is the instructor choosing
 * unlimited attempts or no timer, which has to survive a regenerate exactly
 * like a number would. Collapsing the two would make "no time limit" decay
 * back into whatever the generator picked. */
function readQuizLimit(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function InstructorQuizCreatePage() {
  const location = useLocation();
  const locationState = location.state as AiActionDraftLocationState | null;
  const seededDraft = locationState?.aiQuizDraft;
  const typedDraftId = locationState?.typedDraftId;
  const hasStructuredQuestions =
    Array.isArray(seededDraft?.questions) && seededDraft.questions.length > 0;
  // A resumed quiz draft lands on describe and regenerates, so these are
  // reapplied after generation rather than only seeding the initial draft.
  const seededAllowedAttempts = readQuizLimit(seededDraft?.allowedAttempts);
  const seededTimeLimit = readQuizLimit(seededDraft?.timeLimit);
  const { accessToken, user } = useAuth();
  const [step, setStep] = useState<QuizCreateStep>(
    hasStructuredQuestions ? "review" : "describe",
  );
  const [describeValues, setDescribeValues] =
    useState<QuizDescribeValues>(
      seededDraft
        ? {
            courseId: String(seededDraft.courseId ?? ""),
            prompt: hasStructuredQuestions
              ? "Drafted in the AI Assistant"
              : seededDraft.prompt?.trim() ||
                [
                  seededDraft.name ? `Title: ${seededDraft.name}` : "",
                  seededDraft.description ?? "",
                ]
                  .map((part) => part.trim())
                  .filter(Boolean)
                  .join("\n\n"),
          }
        : initialDescribeValues,
    );
  const [draft, setDraft] = useState<GeneratedQuizDraft | null>(
    hasStructuredQuestions && seededDraft
      ? {
          name: seededDraft.name ?? "",
          description: seededDraft.description ?? "",
          dueDate: seededDraft.dueDate ?? "",
          pointsPossible:
            typeof seededDraft.pointsPossible === "number"
              ? seededDraft.pointsPossible
              : 100,
          allowedAttempts: seededAllowedAttempts ?? null,
          timeLimit: seededTimeLimit ?? null,
          quizEngine: seededDraft.quizEngine ?? "classic",
          questions: seededDraft.questions ?? [],
          questionBankGroups: seededDraft.questionBankGroups ?? [],
        }
      : null,
  );
  const [approvedValues, setApprovedValues] =
    useState<QuizReviewFormSchema | null>(null);
  const [createdQuiz, setCreatedQuiz] = useState<{
    id: number;
    published: boolean;
    quizEngine: QuizEngine;
  } | null>(null);
  const [isPublishingCreatedQuiz, setIsPublishingCreatedQuiz] = useState(false);
  const [publishCreatedQuizError, setPublishCreatedQuizError] = useState<
    string | null
  >(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] =
    useState<QuizReviewFormSchema | null>(null);
  const [preview, setPreview] = useState<QuizPreviewSummary | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [capabilities, setCapabilities] =
    useState<QuizCapabilities | null>(null);
  const [questionBanks, setQuestionBanks] = useState<QuizQuestionBank[]>([]);
  const [isLoadingQuestionBanks, setIsLoadingQuestionBanks] = useState(false);
  const [draftSaveStatus, setDraftSaveStatus] = useState<string | null>(null);
  const [savedTypedDraftId, setSavedTypedDraftId] = useState<string | undefined>(
    typedDraftId,
  );

  const canvasUrl = useCanvasConnectionUrl();
  const {
    activeCourse,
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

  // AI handoff may omit local_course_id; fall back to the active course so
  // review actions (capabilities / question banks) have a real course id.
  const resolvedCourseId =
    describeValues.courseId ||
    (activeCourse ? String(activeCourse.localId) : "");

  const courseLabel =
    courseOptions.find((course) => course.id === resolvedCourseId)?.label ??
    (activeCourse && String(activeCourse.localId) === resolvedCourseId
      ? activeCourse.displayName
      : "your course");
  const effectiveCourseLoadError = needsCanvasConnection
    ? "Connect your Canvas account to load courses."
    : courseLoadError;
  // Persisted with saved drafts so resuming targets this course rather than
  // whatever is active later. Labels only — see TypedDraftContent (#1239).
  const selectedCourse = writableCourses.find(
    (course) => String(course.id) === resolvedCourseId,
  );

  const handleDescribeValuesChange = useCallback((values: QuizDescribeValues) => {
    setDescribeValues((current) =>
      current.courseId === values.courseId && current.prompt === values.prompt
        ? current
        : values,
    );
  }, []);

  const handleReviewDraftChange = useCallback((values: GeneratedQuizDraft) => {
    setDraft((current) => {
      if (
        current &&
        current.name === values.name &&
        current.description === values.description &&
        current.dueDate === values.dueDate &&
        current.pointsPossible === values.pointsPossible &&
        current.allowedAttempts === values.allowedAttempts &&
        current.timeLimit === values.timeLimit &&
        current.quizEngine === values.quizEngine &&
        // useWatch + normalize helpers always allocate new arrays; compare by
        // value so we don't setState → re-render → effect → setState forever.
        JSON.stringify(current.questions) === JSON.stringify(values.questions) &&
        JSON.stringify(current.questionBankGroups) ===
          JSON.stringify(values.questionBankGroups)
      ) {
        return current;
      }
      return values;
    });
  }, []);

  const handleSaveTypedDraft = () => {
    if (!user?.id) return;
    const content = draft
      ? {
          title: draft.name,
          body: draft.description,
          questions: draft.questions.map((question) => question.questionText).join("\n"),
          // Saved alongside the text because they are the instructor's own
          // settings, not generator output. Resuming used to hand the quiz
          // back with whatever the generator defaulted to, silently
          // discarding an attempt limit or timer they had set.
          allowedAttempts: draft.allowedAttempts,
          timeLimit: draft.timeLimit,
        }
      : describeValues.prompt.trim()
        ? { questions: describeValues.prompt.trim() }
        : null;
    if (
      !content ||
      (!content.title?.trim() &&
        !content.body?.trim() &&
        !content.questions?.trim())
    ) {
      setDraftSaveStatus("Add quiz details before saving a draft.");
      return;
    }
    const saved = saveTypedDraft(user.id, {
      id: savedTypedDraftId,
      kind: "quiz",
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

  useEffect(() => {
    const courseId = Number(resolvedCourseId);
    if (
      step !== "review" ||
      !accessToken ||
      !Number.isInteger(courseId) ||
      courseId <= 0
    ) {
      return;
    }
    let cancelled = false;
    void fetchQuizCapabilities(courseId, { accessToken, canvasUrl })
      .then((result) => {
        if (!cancelled) {
          setCapabilities(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCapabilities({
            classicQuizzes: true,
            newQuizzes: false,
            questionBanks: true,
            preferredEngine: "classic",
            newQuizzesUnavailableReason:
              "New Quizzes availability could not be verified. Classic Quiz remains available.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, canvasUrl, resolvedCourseId, step]);

  const handleLoadQuestionBanks = async () => {
    if (!accessToken) {
      setApproveError("Your session has expired. Please sign in again.");
      return;
    }
    const courseId = Number(resolvedCourseId);
    if (!Number.isInteger(courseId) || courseId <= 0) {
      setApproveError(
        "Select a course before loading question banks. Use Back to Describe if no course is set.",
      );
      return;
    }
    if (!canvasUrl) {
      setApproveError(
        "Connect your Canvas account before loading question banks.",
      );
      return;
    }
    setIsLoadingQuestionBanks(true);
    setApproveError(null);
    try {
      const banks = await fetchQuestionBanks(courseId, {
        accessToken,
        canvasUrl,
      });
      setQuestionBanks(banks);
      if (banks.length === 0) {
        setApproveError(
          "No Classic question banks were found in this Canvas course.",
        );
      }
    } catch (error) {
      setApproveError(
        error instanceof Error
          ? error.message
          : "Unable to load Canvas question banks.",
      );
    } finally {
      setIsLoadingQuestionBanks(false);
    }
  };

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
      // The generator does not know what the instructor had already chosen,
      // so a resumed draft's own attempt limit and timer win over its
      // defaults. Absent settings leave the generated values alone.
      setDraft({
        ...generated,
        ...(seededAllowedAttempts !== undefined
          ? { allowedAttempts: seededAllowedAttempts }
          : {}),
        ...(seededTimeLimit !== undefined ? { timeLimit: seededTimeLimit } : {}),
      });
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
      courseId: resolvedCourseId,
      name: values.name,
      description: values.description,
      dueDate: values.dueDate,
      pointsPossible: values.pointsPossible,
      allowedAttempts: values.allowedAttempts,
      timeLimit: values.timeLimit,
      quizEngine: values.quizEngine,
      questions: values.questions,
      questionBankGroups: values.questionBankGroups,
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
      const created = await approveQuizDraft(
        {
          courseId: resolvedCourseId,
          name: pendingApproval.name,
          description: pendingApproval.description,
          dueDate: pendingApproval.dueDate,
          pointsPossible: pendingApproval.pointsPossible,
          allowedAttempts: pendingApproval.allowedAttempts,
          timeLimit: pendingApproval.timeLimit,
          quizEngine: pendingApproval.quizEngine,
          questions: pendingApproval.questions,
          questionBankGroups: pendingApproval.questionBankGroups,
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
      setCreatedQuiz({
        id: created.id,
        published: created.published,
        quizEngine: created.quizEngine,
      });
      setPublishCreatedQuizError(null);
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
    setCreatedQuiz(null);
    setPublishCreatedQuizError(null);
    setGenerateError(null);
    setApproveError(null);
    setPendingApproval(null);
    setPreview(null);
    setIsPreviewOpen(false);
    setCapabilities(null);
    setQuestionBanks([]);
    setDraftSaveStatus(null);
    setSavedTypedDraftId(undefined);
  };

  if (approvedValues) {
    const handlePublishCreatedQuiz = async () => {
      if (!accessToken || !canvasUrl || !createdQuiz || !resolvedCourseId) {
        setPublishCreatedQuizError(
          "Unable to publish this quiz. Reload the course quizzes list and try again.",
        );
        return;
      }

      setIsPublishingCreatedQuiz(true);
      setPublishCreatedQuizError(null);
      try {
        const updated = await setQuizPublished(
          Number(resolvedCourseId),
          createdQuiz.id,
          true,
          accessToken,
          {
            canvasUrl,
            quizEngine: createdQuiz.quizEngine,
          },
        );
        setCreatedQuiz({
          id: updated.id,
          published: updated.published,
          quizEngine: updated.quiz_engine,
        });
      } catch (error) {
        setPublishCreatedQuizError(
          error instanceof QuizApiError
            ? error.message
            : "Unable to publish quiz. Please try again.",
        );
      } finally {
        setIsPublishingCreatedQuiz(false);
      }
    };

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
              {createdQuiz?.published
                ? "Your quiz has been created and published in Canvas."
                : "Your quiz has been created in Canvas as a draft."}
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
            {publishCreatedQuizError ? (
              <p role="alert" className="text-destructive">
                {publishCreatedQuizError}
              </p>
            ) : null}
          </CardContent>
          <CardFooter className="flex flex-wrap gap-2 border-t bg-transparent">
            {createdQuiz && !createdQuiz.published ? (
              <Button
                type="button"
                disabled={isPublishingCreatedQuiz}
                aria-busy={isPublishingCreatedQuiz}
                onClick={() => void handlePublishCreatedQuiz()}
              >
                {isPublishingCreatedQuiz ? (
                  <Loader2 data-icon="inline-start" className="animate-spin" />
                ) : null}
                Publish quiz
              </Button>
            ) : null}
            {resolvedCourseId ? (
              <Button
                type="button"
                variant="outline"
                render={
                  <Link to={instructorCourseQuizzesPath(resolvedCourseId)} />
                }
              >
                View course quizzes
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={handleCreateAnother}>
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
        <QuizDescribeStep
          defaultValues={{ ...describeValues, courseId: resolvedCourseId }}
          isGenerating={isGenerating}
          generateError={generateError}
          courseOptions={courseOptions}
          courseLoadError={effectiveCourseLoadError}
          isLoadingCourses={isLoadingCourses}
          onGenerate={handleGenerate}
          onValuesChange={handleDescribeValuesChange}
        />
      ) : draft ? (
        <QuizReviewApproveStep
          courseLabel={courseLabel}
          draft={draft}
          approveError={approveError}
          isApproving={isPreviewLoading}
          capabilities={capabilities}
          questionBanks={questionBanks}
          isLoadingQuestionBanks={isLoadingQuestionBanks}
          onLoadQuestionBanks={() => void handleLoadQuestionBanks()}
          onApprove={handleRequestApproval}
          onBack={handleBack}
          onDraftChange={handleReviewDraftChange}
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
