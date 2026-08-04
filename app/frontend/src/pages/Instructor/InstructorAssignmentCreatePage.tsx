import { CheckCircle2, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { CanvasConnectionRequired } from "@/components/common/CanvasConnectionRequired";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveCourse } from "@/contexts/useActiveCourse";
import { useInstitution } from "@/contexts/useInstitution";
import { useCanvasConnectionUrl } from "@/hooks/useCanvasConnectionUrl";
import { formatDueDateForDisplay } from "@/lib/assignment-utils";
import { useInstructorCanvasTimezone } from "@/lib/useInstructorCanvasTimezone";
import { disambiguateCourseLabels } from "@/lib/disambiguate-course-labels";
import { pageShellNarrow } from "@/lib/page-shell";
import { paths, type AiActionDraftLocationState } from "@/routes/paths";
import {
  discardTypedDraft,
  saveTypedDraft,
} from "@/lib/typed-draft-storage";
import {
  approveAssignmentDraft,
  generateAssignmentDraft,
  previewAssignmentDraft,
} from "@/services/assignmentCreator";
import type {
  AssignmentCreateCourseOption,
  AssignmentCreateStep,
  AssignmentDescribeValues,
  AssignmentPreviewSummary,
  GeneratedAssignmentDraft,
} from "@/types/assignmentCreate";

import { AssignmentCreateStepper } from "./InstructorAssignmentCreate/AssignmentCreateStepper";
import { AssignmentDescribeStep } from "./InstructorAssignmentCreate/AssignmentDescribeStep";
import { AssignmentPreviewDialog } from "./InstructorAssignmentCreate/AssignmentPreviewDialog";
import { AssignmentReviewApproveStep } from "./InstructorAssignmentCreate/AssignmentReviewApproveStep";
import type { AssignmentReviewFormSchema } from "./InstructorAssignmentCreate/assignmentCreateSchema";

const initialDescribeValues: AssignmentDescribeValues = {
  courseId: "",
  prompt: "",
};

export function InstructorAssignmentCreatePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const locationState = location.state as AiActionDraftLocationState | null;
  const seededDraft = locationState?.aiAssignmentDraft;
  const typedDraftId = locationState?.typedDraftId;
  const hasGeneratedAssignment = Boolean(seededDraft?.name?.trim());
  const { accessToken, user } = useAuth();
  // The chat extracts a one-line description ("it is about beef corndogs")
  // where the "+ Create Assignment" path runs that same text through the
  // draft generator and gets a written-out one. A chat handoff now carries
  // the prompt that produced it so this page can run the identical
  // generator call and land on Review at the same quality (#15). Absent on
  // older handoffs and on the per-course Create button, which correctly
  // leaves both paths untouched.
  const assistantPrompt = seededDraft?.prompt?.trim() ?? "";
  const shouldEnhanceDescription = Boolean(
    hasGeneratedAssignment && assistantPrompt && seededDraft?.courseId && accessToken,
  );
  const [step, setStep] = useState<AssignmentCreateStep>(
    hasGeneratedAssignment ? "review" : "describe",
  );
  // Derived rather than stored: accessToken can settle after mount, and a
  // stored initial value computed before that would leave the spinner off
  // for the whole generate call.
  const [hasEnhancementSettled, setHasEnhancementSettled] = useState(false);
  const isEnhancingDescription =
    shouldEnhanceDescription && !hasEnhancementSettled;
  const [describeValues, setDescribeValues] =
    useState<AssignmentDescribeValues>(
      seededDraft
        ? {
            courseId: String(seededDraft.courseId ?? ""),
            // Show the prompt that was actually sent, so stepping back to
            // Describe is editable and re-runnable rather than showing the
            // old "Drafted in the AI Assistant" placeholder.
            prompt:
              assistantPrompt || seededDraft.description?.trim() || "",
          }
        : initialDescribeValues,
    );
  const [draft, setDraft] = useState<GeneratedAssignmentDraft | null>(
    hasGeneratedAssignment && seededDraft
      ? {
          name: seededDraft.name ?? "",
          description: seededDraft.description ?? "",
          dueDate: seededDraft.dueDate ?? "",
          pointsPossible:
            typeof seededDraft.pointsPossible === "number" &&
            Number.isFinite(seededDraft.pointsPossible) &&
            seededDraft.pointsPossible > 0
              ? seededDraft.pointsPossible
              : null,
        }
      : null,
  );
  const [approvedValues, setApprovedValues] =
    useState<AssignmentReviewFormSchema | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] =
    useState<AssignmentReviewFormSchema | null>(null);
  const [preview, setPreview] = useState<AssignmentPreviewSummary | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [draftSaveStatus, setDraftSaveStatus] = useState<string | null>(null);
  const [savedTypedDraftId, setSavedTypedDraftId] = useState<string | undefined>(
    typedDraftId,
  );

  const canvasUrl = useCanvasConnectionUrl();
  const instructorTimeZone = useInstructorCanvasTimezone(canvasUrl);
  const {
    availableCourses,
    isLoading: isLoadingCourses,
    error: courseLoadError,
    needsCanvasConnection,
    refreshActiveCourse,
  } = useActiveCourse();
  const { refreshDashboard } = useInstitution();

  // Creating an assignment is a write — a completed course is selectable
  // elsewhere (e.g. the active-course selector) but can't be written to, so
  // it's excluded here specifically, not just wherever isPublished is used.
  const writableCourses = useMemo(
    () => availableCourses.filter((course) => course.isWritable),
    [availableCourses],
  );
  const labelById = useMemo(
    () => disambiguateCourseLabels(writableCourses),
    [writableCourses],
  );
  const courseOptions: AssignmentCreateCourseOption[] = useMemo(
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

  // Preview data is valid only for the exact form snapshot that generated it.
  // Keep all invalidation paths here so cancel, edit, regenerate, and back-nav
  // behave consistently instead of leaving a stale dialog payload behind.
  const resetPreviewState = useCallback(() => {
    setPendingApproval(null);
    setPreview(null);
    setIsPreviewOpen(false);
  }, []);

  // Fires once per chat handoff. The ref is the single-flight guard, and
  // deliberately the ONLY one: canvasUrl resolves out of AuthContext /
  // InstitutionContext, so it is undefined on the first render and populated
  // a tick later. That dep change re-runs this effect while the request is
  // still in flight. An in-flight-cancel on cleanup looks right here but
  // deadlocks against the ref — the first run gets cancelled, the second is
  // refused as a duplicate, and nothing is left to clear the spinner or
  // deliver the description. The backend answers in well under a second;
  // the hang was entirely this. So: never cancel, always settle, and let
  // the ref keep it to one call.
  const hasAutoGeneratedRef = useRef(false);

  useEffect(() => {
    // shouldEnhanceDescription already requires accessToken, so no session
    // means no spinner and no call — the assistant's own description stands.
    // It is repeated in this guard only so TypeScript narrows accessToken to
    // string for the call below; Boolean(...) hides that from the compiler,
    // and the frontend image runs "tsc -b && vite build", so leaving it
    // unnarrowed fails docker-build while the test jobs stay green.
    if (!shouldEnhanceDescription || !accessToken || hasAutoGeneratedRef.current) {
      return;
    }

    hasAutoGeneratedRef.current = true;

    void (async () => {
      try {
        const generated = await generateAssignmentDraft(
          Number(seededDraft?.courseId),
          assistantPrompt,
          { accessToken, canvasUrl },
        );
        // An empty expansion is a failed expansion, not a no-op. Silently
        // keeping the chat's one-liner cleared the spinner and left the
        // instructor on Review looking at the vague description this call
        // exists to replace, with nothing to say it had not worked. Raising
        // it routes into the same catch as a request failure, so the two
        // look identical to the instructor: an error, and Describe with the
        // prompt intact to retry or edit.
        const expanded = generated.description.trim();
        if (!expanded) {
          throw new Error(
            "The expanded description came back empty. Review or edit it below.",
          );
        }
        // Only the description is taken. The assistant already resolved
        // title, due date, and points from what the instructor explicitly
        // asked for ("worth 120 points, due Friday at 11:59 PM") — letting
        // the generator's own defaults overwrite those would be a worse
        // regression than the vague description this is fixing.
        setDraft((current) =>
          current ? { ...current, description: expanded } : current,
        );
      } catch (error) {
        // Drop to Describe with the prompt intact so the instructor can
        // retry or edit, instead of stranding them on Review.
        setGenerateError(
          error instanceof Error
            ? error.message
            : "Unable to expand the description. Review or edit it below.",
        );
        setStep("describe");
      } finally {
        setHasEnhancementSettled(true);
      }
    })();
  }, [
    shouldEnhanceDescription,
    accessToken,
    canvasUrl,
    assistantPrompt,
    seededDraft?.courseId,
  ]);

  const handleDescribeValuesChange = useCallback((values: AssignmentDescribeValues) => {
    setDescribeValues((current) =>
      current.courseId === values.courseId && current.prompt === values.prompt
        ? current
        : values,
    );
    resetPreviewState();
  }, [resetPreviewState]);

  const handleReviewDraftChange = useCallback((values: GeneratedAssignmentDraft) => {
    setDraft((current) => {
      if (
        current &&
        current.name === values.name &&
        current.description === values.description &&
        current.dueDate === values.dueDate &&
        current.pointsPossible === values.pointsPossible
      ) {
        return current;
      }
      resetPreviewState();
      return values;
    });
  }, [resetPreviewState]);

  const handleSaveTypedDraft = () => {
    if (!user?.id) return;
    const content = draft
      ? {
          title: draft.name,
          body: draft.description,
          dueDate: draft.dueDate,
          pointsPossible: draft.pointsPossible,
        }
      : describeValues.prompt.trim()
        ? { body: describeValues.prompt.trim() }
        : null;
    if (!content || (!content.title?.trim() && !content.body?.trim())) {
      setDraftSaveStatus("Add a title or description before saving a draft.");
      return;
    }
    const saved = saveTypedDraft(user.id, {
      id: savedTypedDraftId,
      kind: "assignment",
      content,
    });
    setSavedTypedDraftId(saved.id);
    setDraftSaveStatus("Draft saved. Resume it anytime from the assistant.");
  };

  // Carries the prompt across rather than restarting it. Seeds the same
  // aiQuizDraft state the assistant handoff and typed-draft resume already
  // use, so the Quiz Creator opens on describe with the text in place.
  const handleSwitchToQuiz = (prompt: string) => {
    navigate(paths.instructor.quizCreate, {
      state: {
        aiQuizDraft: {
          ...(describeValues.courseId
            ? { courseId: Number(describeValues.courseId) }
            : {}),
          name: "",
          description: "",
          prompt,
        },
      },
    });
  };

  const handleGenerate = async (values: AssignmentDescribeValues) => {
    if (!accessToken) {
      setGenerateError("Your session has expired. Please sign in again.");
      return;
    }

    setDescribeValues(values);
    setGenerateError(null);
    setIsGenerating(true);

    try {
      const courseId = Number(values.courseId);
      const generated = await generateAssignmentDraft(courseId, values.prompt, {
        accessToken,
        canvasUrl,
        timeZone: instructorTimeZone,
      });
      resetPreviewState();
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
    resetPreviewState();
  };

  const handleStepChange = (nextStep: AssignmentCreateStep) => {
    if (nextStep === step) {
      return;
    }
    if (nextStep === "describe") {
      handleBack();
      return;
    }
    // Review is reachable from the stepper only after a draft exists; otherwise
    // the describe form still owns the required course/prompt validation.
    if (draft) {
      setStep("review");
    }
  };

  const handlePreviewOpenChange = (open: boolean) => {
    if (isApproving) {
      return;
    }
    if (open) {
      setIsPreviewOpen(true);
      return;
    }
    resetPreviewState();
  };

  const handleRequestApproval = async (values: AssignmentReviewFormSchema) => {
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
    };

    setApproveError(null);
    setIsPreviewLoading(true);

    try {
      const previewSummary = await previewAssignmentDraft(payload, {
        accessToken,
        canvasUrl,
        timeZone: instructorTimeZone,
      });
      setPreview(previewSummary);
      setPendingApproval(values);
      setIsPreviewOpen(true);
    } catch (error) {
      setApproveError(
        error instanceof Error
          ? error.message
          : "Unable to preview this assignment. Please try again.",
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
      await approveAssignmentDraft({
        courseId: describeValues.courseId,
        name: pendingApproval.name,
        description: pendingApproval.description,
        dueDate: pendingApproval.dueDate,
        pointsPossible: pendingApproval.pointsPossible,
      }, {
        accessToken,
        canvasUrl,
        timeZone: instructorTimeZone,
      });
      if (user?.id && savedTypedDraftId) {
        discardTypedDraft(user.id, savedTypedDraftId);
        setSavedTypedDraftId(undefined);
      }
      setApprovedValues(pendingApproval);
      resetPreviewState();
      // This wizard commits straight to Canvas rather than going through the
      // Workflow used elsewhere — ActiveCourseProvider/InstitutionProvider
      // won't know a new assignment exists until explicitly told to refetch.
      void refreshActiveCourse();
      void refreshDashboard();
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
      <div className={pageShellNarrow}>
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
    setPendingApproval(null);
    setPreview(null);
    setIsPreviewOpen(false);
    setDraftSaveStatus(null);
    setSavedTypedDraftId(undefined);
  };

  if (approvedValues) {
    return (
      <div className={pageShellNarrow}>
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
                {formatDueDateForDisplay(approvedValues.dueDate, {
                  treatAsDatetimeLocal: true,
                })}
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
    <div className={pageShellNarrow}>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">AI Assignment Creator</h1>
        <p className="text-sm text-muted-foreground">
          Generate assignments with AI assistance.
        </p>
      </header>

      <AssignmentCreateStepper
        currentStep={step}
        canNavigateToReview={Boolean(draft)}
        onStepChange={handleStepChange}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Saving mid-expansion captured the pre-expansion description and
            left a second resumable copy of an assignment the chat already
            had a pending workflow for. Wait for the draft to settle. */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isEnhancingDescription}
          onClick={handleSaveTypedDraft}
        >
          Save draft
        </Button>
        {draftSaveStatus ? (
          <p role="status" className="text-sm text-muted-foreground">
            {draftSaveStatus}
          </p>
        ) : null}
      </div>

      {step === "describe" ? (
        <AssignmentDescribeStep
          defaultValues={describeValues}
          isGenerating={isGenerating}
          generateError={generateError}
          courseOptions={courseOptions}
          courseLoadError={effectiveCourseLoadError}
          isLoadingCourses={isLoadingCourses}
          onGenerate={handleGenerate}
          onValuesChange={handleDescribeValuesChange}
          onSwitchToQuiz={handleSwitchToQuiz}
        />
      ) : isEnhancingDescription ? (
        /* There's a real LLM round-trip between the assistant handoff and a
           reviewable draft now, so say so rather than flashing the chat's
           one-line description and swapping it under the instructor (#15). */
        <Card>
          <CardContent className="flex items-center gap-3 py-8">
            <Loader2
              className="size-5 shrink-0 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
            <p role="status" className="text-sm text-muted-foreground">
              Writing a full description from your request…
            </p>
          </CardContent>
        </Card>
      ) : draft ? (
        <AssignmentReviewApproveStep
          courseLabel={courseLabel}
          draft={draft}
          approveError={approveError}
          isApproving={isPreviewLoading}
          onApprove={handleRequestApproval}
          onBack={handleBack}
          onDraftChange={handleReviewDraftChange}
          instructorTimeZone={instructorTimeZone}
        />
      ) : null}

      <AssignmentPreviewDialog
        open={isPreviewOpen}
        onOpenChange={handlePreviewOpenChange}
        preview={preview}
        isCreating={isApproving}
        onConfirm={() => void handleConfirmCreate()}
      />
    </div>
  );
}
