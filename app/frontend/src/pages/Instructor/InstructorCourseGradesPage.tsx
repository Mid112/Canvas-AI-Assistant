import { AlertTriangle, CheckCircle2, History, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import { CanvasConnectionRequired } from "@/components/common/CanvasConnectionRequired";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useResolvedInstructorCourse } from "@/hooks/useResolvedInstructorCourse";
import { pageShell } from "@/lib/page-shell";
import {
  STUDENT_COMMUNICATION_PROFANITY_MESSAGE,
  containsProfanity,
} from "@/lib/profanity";
import { cn } from "@/lib/utils";
import { fetchCourseAssignments } from "@/services/assignments";
import {
  previewGradeUpdate,
  submitGradeUpdate,
} from "@/services/gradeManagement";
import { fetchAssignmentSubmissions } from "@/services/submissions";
import type { Assignment } from "@/types/assignment";
import type { GradePreview } from "@/types/gradeManagement";
import type { ApiSubmission } from "@/types/submission";

type GradeStatusFilter = "all" | "graded" | "submitted" | "unsubmitted";

const supportedTextGrades = new Set([
  "complete",
  "incomplete",
  "pass",
  "fail",
  "p",
  "np",
  "satisfactory",
  "unsatisfactory",
]);
// Mirror the backend allow-list so invalid grade text is caught before preview.
// Canvas handles "excused" through a separate boolean action, not posted_grade.
const letterGradePattern = /^(?:A|B|C|D)[+-]?$|^F$/i;
const decimalGradePattern = /^(?:\d+(?:\.\d+)?|\.\d+)$/;

async function runSequentially<T, R>(
  items: T[],
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  // Canvas grade writes are official mutations. Keep bulk submit intentionally
  // sequential so a large selection does not fan out into rate-limit spikes.
  const results: R[] = [];
  for (const item of items) {
    results.push(await task(item));
  }
  return results;
}

function normalizeSubmissionStatus(submission: ApiSubmission) {
  return String(submission.status || submission.workflow_state || "")
    .trim()
    .toLowerCase();
}

function hasGrade(submission: ApiSubmission) {
  return (
    submission.score !== null ||
    (submission.grade !== null && submission.grade.trim() !== "" && submission.grade !== "-")
  );
}

function hasSubmittedAt(submission: ApiSubmission) {
  return Boolean(submission.submitted_at);
}

function isUnsubmitted(submission: ApiSubmission) {
  return !hasSubmittedAt(submission);
}

function getDisplayStatuses(submission: ApiSubmission): Array<Exclude<GradeStatusFilter, "all">> {
  // Status labels are independent: a row can be both "Unsubmitted" and "Graded"
  // when an instructor entered a score for work that had no Canvas submit date.
  const statuses: Array<Exclude<GradeStatusFilter, "all">> = [
    hasSubmittedAt(submission) ? "submitted" : "unsubmitted",
  ];
  if (hasGrade(submission)) {
    statuses.push("graded");
  }
  return statuses;
}

function matchesSubmissionStatusFilter(submission: ApiSubmission, filter: GradeStatusFilter) {
  if (filter === "all") {
    return true;
  }
  if (filter === "graded") {
    return hasGrade(submission);
  }
  return filter === "submitted" ? hasSubmittedAt(submission) : isUnsubmitted(submission);
}

function formatSubmissionStatus(submission: ApiSubmission) {
  const statuses = getDisplayStatuses(submission);
  if (statuses.length === 0) {
    const status = normalizeSubmissionStatus(submission);
    return status ? status.charAt(0).toUpperCase() + status.slice(1) : "Unknown";
  }
  return statuses
    .map((status) => status.charAt(0).toUpperCase() + status.slice(1))
    .join(", ");
}

function getGradeValidationError(value: string) {
  const grade = value.trim();
  if (!grade) {
    return null;
  }
  if (decimalGradePattern.test(grade)) {
    const numericGrade = Number(grade);
    if (numericGrade < 0) {
      return "Grade cannot be negative.";
    }
    if (numericGrade > 10000) {
      return "Grade is outside the supported range.";
    }
    return null;
  }
  if (letterGradePattern.test(grade) || supportedTextGrades.has(grade.toLowerCase())) {
    return null;
  }
  return "Use a numeric grade or a supported Canvas grade such as A-, complete, or pass.";
}

export function InstructorCourseGradesPage() {
  const { localCourseId } = useParams();
  const [searchParams] = useSearchParams();
  const parsedLocalCourseId = Number(localCourseId);
  const { accessToken, user } = useAuth();
  const {
    course,
    canvasUrl,
    isLoading: isResolvingCourse,
    needsCanvasConnection,
  } = useResolvedInstructorCourse(parsedLocalCourseId);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignmentId, setAssignmentId] = useState<number | "">("");
  const [submissions, setSubmissions] = useState<ApiSubmission[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [postedGrade, setPostedGrade] = useState("");
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [studentFilter, setStudentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<GradeStatusFilter>("all");
  const [gradeFilter, setGradeFilter] = useState("");
  const [previews, setPreviews] = useState<GradePreview[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const prefill = useMemo(() => {
    // The AI assistant links here with real ids it resolved from Canvas-backed
    // data. Keep the contract URL-based so refresh/back/forward preserve the
    // draft target without adding another global state store.
    const studentIds = (searchParams.get("studentIds") ?? "")
      .split(",")
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
    const assignmentIdParam = Number(searchParams.get("assignmentId"));
    return {
      assignmentId: Number.isFinite(assignmentIdParam) ? assignmentIdParam : null,
      studentIds,
      grade: searchParams.get("grade") ?? "",
      reason: searchParams.get("reason") ?? "",
    };
  }, [searchParams]);

  useEffect(() => {
    if (!accessToken || !user?.has_canvas_token || !course || !canvasUrl) {
      return;
    }
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async Canvas data load
    setIsLoading(true);
    fetchCourseAssignments(parsedLocalCourseId, accessToken, canvasUrl)
      .then((items) => {
        if (!cancelled) {
          setAssignments(items);
          // Prefer the assistant-provided assignment when it still exists in
          // the freshly fetched Canvas list; otherwise fall back to the first
          // assignment so the page remains usable after stale/deleted links.
          setAssignmentId(
            prefill.assignmentId && items.some((item) => item.id === prefill.assignmentId)
              ? prefill.assignmentId
              : items[0]?.id ?? "",
          );
          if (prefill.grade) {
            setPostedGrade(prefill.grade);
          }
          // Reason is optional but included in the same prefill path so grade
          // history and Canvas comments can share the instructor's rationale.
          if (prefill.reason) {
            setReason(prefill.reason);
          }
          setError(null);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message || "Unable to load assignments.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    accessToken,
    canvasUrl,
    course,
    parsedLocalCourseId,
    prefill.assignmentId,
    prefill.grade,
    prefill.reason,
    user?.has_canvas_token,
  ]);

  useEffect(() => {
    if (!accessToken || !assignmentId || !canvasUrl) {
      return;
    }
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async Canvas data load
    setIsLoading(true);
    fetchAssignmentSubmissions(
      parsedLocalCourseId,
      assignmentId,
      accessToken,
      canvasUrl,
    )
      .then((items) => {
        if (!cancelled) {
          setSubmissions(items);
          // Default manual visits away from unsubmitted rows, but preserve the
          // AI handoff's explicit target list when the instructor asked for it.
          const prefilledSelection = prefill.studentIds.filter((id) =>
            items.some((item) => item.user_id === id),
          );
          setSelectedUserIds(
            prefilledSelection.length > 0
              ? prefilledSelection
              : items
                .filter((item) => !isUnsubmitted(item))
                .map((item) => item.user_id),
          );
          setPreviews([]);
          setNotice(null);
          setError(null);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message || "Unable to load grades.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, assignmentId, canvasUrl, parsedLocalCourseId, prefill.studentIds]);

  const selectedSubmissions = useMemo(
    () => submissions.filter((item) => selectedUserIds.includes(item.user_id)),
    [selectedUserIds, submissions],
  );
  const selectedAssignment = useMemo(
    () => assignments.find((assignment) => assignment.id === assignmentId),
    [assignmentId, assignments],
  );
  const displayedSubmissions = useMemo(() => {
    const normalizedStudentFilter = studentFilter.trim().toLowerCase();
    const normalizedGradeFilter = gradeFilter.trim().toLowerCase();

    // Filters work entirely from the submissions already shown on the page.
    // They do not mutate selection, so instructors can filter, inspect, then
    // explicitly choose all visible rows or individual students.
    return submissions.filter((submission) => {
      const studentText = [
        submission.student_name,
        submission.student_email,
        submission.student_login_id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const gradeText = [submission.grade, submission.score]
        .filter((value) => value !== null && value !== undefined)
        .join(" ")
        .toLowerCase();

      return (
        (!normalizedStudentFilter || studentText.includes(normalizedStudentFilter)) &&
        matchesSubmissionStatusFilter(submission, statusFilter) &&
        (!normalizedGradeFilter || gradeText.includes(normalizedGradeFilter))
      );
    });
  }, [gradeFilter, statusFilter, studentFilter, submissions]);
  // Warnings are advisory rather than blockers: paper/in-person assignments
  // and bonus grading both make these states valid instructor choices.
  const selectedUnsubmittedCount = selectedSubmissions.filter(
    (submission) => isUnsubmitted(submission),
  ).length;
  const numericPostedGrade = Number(postedGrade);
  const hasGradeChange = postedGrade.trim().length > 0;
  const gradeValidationError = getGradeValidationError(postedGrade);
  const hasFeedback = reason.trim().length > 0;
  const isFeedbackOnly = !hasGradeChange && hasFeedback;
  const feedbackHasProfanity = containsProfanity(reason);
  const exceedsPointsPossible =
    hasGradeChange &&
    Number.isFinite(numericPostedGrade) &&
    typeof selectedAssignment?.points_possible === "number" &&
    numericPostedGrade > selectedAssignment.points_possible;

  const payloads = useMemo(
    () =>
      assignmentId
        ? selectedSubmissions.map((submission) => ({
          assignment_id: assignmentId,
          user_id: submission.user_id,
          posted_grade: postedGrade,
          reason: reason || null,
          // Reuse the row the page already fetched from Canvas so preview
          // can render the before/after diff without another submissions read.
          current_submission: {
            ...submission,
            assignment_points_possible: selectedAssignment?.points_possible ?? null,
          },
        }))
        : [],
    [assignmentId, postedGrade, reason, selectedAssignment?.points_possible, selectedSubmissions],
  );

  const allDisplayedSelected =
    displayedSubmissions.length > 0 &&
    displayedSubmissions.every((item) => selectedUserIds.includes(item.user_id));
  const previewByUserId = useMemo(
    () => new Map(previews.map((preview) => [preview.current.student_canvas_id, preview])),
    [previews],
  );
  const previewWarnings = useMemo(
    () => Array.from(new Set(previews.flatMap((preview) => preview.proposed.warnings ?? []))),
    [previews],
  );
  const previewMatchesSelection =
    payloads.length > 0 &&
    previews.length === payloads.length &&
    payloads.every((payload) => {
      // A submit is only valid for the exact grade value the instructor just
      // previewed; changing the field intentionally locks submit again.
      const preview = previewByUserId.get(payload.user_id);
      return preview?.proposed.posted_grade === payload.posted_grade.trim();
    });

  function toggleStudent(userId: number) {
    setSelectedUserIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );
    setPreviews([]);
  }

  function toggleAllStudents() {
    const visibleIds = displayedSubmissions.map((item) => item.user_id);
    setSelectedUserIds((current) =>
      allDisplayedSelected
        ? current.filter((id) => !visibleIds.includes(id))
        : Array.from(new Set([...current, ...visibleIds])),
    );
    setPreviews([]);
  }

  async function handlePreview() {
    if (payloads.length === 0 || !accessToken) {
      return;
    }
    // Preview and submit share these client-side blockers so the UI never
    // green-lights a request the API would reject.
    if (gradeValidationError) {
      setError(gradeValidationError);
      setPreviews([]);
      return;
    }
    if (feedbackHasProfanity) {
      setError(STUDENT_COMMUNICATION_PROFANITY_MESSAGE);
      setPreviews([]);
      return;
    }
    setIsSubmitting(true);
    try {
      const results = await Promise.all(
        payloads.map((payload) =>
          previewGradeUpdate(parsedLocalCourseId, payload, accessToken, canvasUrl),
        ),
      );
      setPreviews(results);
      setError(null);
      setNotice(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to preview grade update.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit() {
    if (!previewMatchesSelection) {
      setError("Preview the selected grade changes before submitting.");
      return;
    }
    if (gradeValidationError) {
      setError(gradeValidationError);
      return;
    }
    if (
      payloads.length === 0 ||
      !accessToken ||
      (!isFeedbackOnly && confirmation !== "UPDATE")
    ) {
      return;
    }
    if (feedbackHasProfanity) {
      setError(STUDENT_COMMUNICATION_PROFANITY_MESSAGE);
      return;
    }
    setIsSubmitting(true);
    try {
      const results = await runSequentially(payloads, (payload) =>
        submitGradeUpdate(parsedLocalCourseId, payload, accessToken, canvasUrl),
      );
      setNotice(
        results.length === 1
          ? `${isFeedbackOnly ? "Feedback sent" : "Grade updated"}. History record #${results[0].history_id ?? "created"}.`
          : `${results.length} ${isFeedbackOnly ? "feedback notes sent" : "grades updated"}. History records created.`,
      );
      setPreviews([]);
      setConfirmation("");
      if (!isFeedbackOnly) {
        // Avoid leaving feedback text behind after a grade write; otherwise the
        // panel can reclassify the empty grade draft as feedback-only.
        setPostedGrade("");
        setReason("");
      }
      if (assignmentId) {
        const refreshedSubmissions = await fetchAssignmentSubmissions(
          parsedLocalCourseId,
          assignmentId,
          accessToken,
          canvasUrl,
        );
        const submittedByUserId = new Map(
          results.map((result) => [result.canvas_submission.user_id, result.canvas_submission]),
        );
        // Canvas can briefly return stale submission rows after an update. Merge
        // the submit response back into the refreshed roster so the current page
        // reflects the write immediately while still preserving other Canvas rows.
        setSubmissions(
          refreshedSubmissions.map(
            (submission) => submittedByUserId.get(submission.user_id) ?? submission,
          ),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit grade update.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!user?.has_canvas_token || needsCanvasConnection) {
    return (
      <div className={pageShell}>
        <CanvasConnectionRequired />
      </div>
    );
  }

  return (
    <div className={pageShell}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Grade Management
          </h1>
          <p className="text-muted-foreground">
            {course?.name ?? "Select a course"} grade changes require preview and approval.
          </p>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
      {notice && (
        <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          {notice}
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
        <Card className="overflow-hidden shadow-sm ring-1 ring-border/60">
          <CardHeader className="space-y-4">
            <div className="grid items-end gap-6 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="assignment" className="leading-none">
                  Assignment
                </Label>
                <select
                  id="assignment"
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={assignmentId}
                  onChange={(event) => {
                    setAssignmentId(Number(event.target.value));
                    setPreviews([]);
                  }}
                >
                  {assignments.map((assignment) => (
                    <option key={assignment.id} value={assignment.id}>
                      {assignment.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="new-grade" className="leading-none">
                  New grade
                </Label>
                <Input
                  id="new-grade"
                  className="h-11"
                  aria-invalid={Boolean(gradeValidationError)}
                  value={postedGrade}
                  onChange={(event) => {
                    setPostedGrade(event.target.value);
                    setPreviews([]);
                  }}
                  placeholder="92, A-, or complete/incomplete"
                />
                {gradeValidationError && (
                  <p className="text-xs font-medium text-destructive">
                    {gradeValidationError}
                  </p>
                )}
              </div>
            </div>
            <div className="grid gap-3 border-t pt-4 md:grid-cols-[1fr_12rem_10rem]">
              <div className="grid gap-2">
                <Label htmlFor="student-filter" className="text-xs">
                  Filter students
                </Label>
                <Input
                  id="student-filter"
                  value={studentFilter}
                  onChange={(event) => setStudentFilter(event.target.value)}
                  placeholder="Name, email, or login"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="status-filter" className="text-xs">
                  Status
                </Label>
                <select
                  id="status-filter"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as GradeStatusFilter)}
                >
                  <option value="all">All Statuses</option>
                  <option value="graded">Graded</option>
                  <option value="submitted">Submitted</option>
                  <option value="unsubmitted">Unsubmitted</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="grade-filter" className="text-xs">
                  Grade
                </Label>
                <Input
                  id="grade-filter"
                  value={gradeFilter}
                  onChange={(event) => setGradeFilter(event.target.value)}
                  placeholder="88, A-"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isResolvingCourse || isLoading ? (
              <div className="flex items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Loading grades from Canvas...
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead>New</TableHead>
                    <TableHead className="w-24">
                      <div className="flex items-center gap-2 text-xs font-medium">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={allDisplayedSelected}
                            onChange={toggleAllStudents}
                          />
                          All
                        </label>
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedSubmissions.map((submission) => {
                    const preview = previewByUserId.get(submission.user_id);
                    return (
                      <TableRow
                        key={submission.id}
                        className={cn(
                          isUnsubmitted(submission) && "bg-muted/30",
                        )}
                      >
                        <TableCell className="font-medium">
                          {submission.student_name ?? `User ${submission.user_id}`}
                        </TableCell>
                        <TableCell className="capitalize">
                          <span className="inline-flex items-center gap-2">
                            {formatSubmissionStatus(submission)}
                          </span>
                        </TableCell>
                        <TableCell>{submission.score ?? "-"}</TableCell>
                        <TableCell>{submission.grade ?? "-"}</TableCell>
                        <TableCell
                          className={cn(
                            "font-medium",
                            preview && "bg-amber-50 text-amber-900",
                          )}
                        >
                          {preview?.proposed.posted_grade ?? "-"}
                        </TableCell>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selectedUserIds.includes(submission.user_id)}
                            onChange={() => toggleStudent(submission.user_id)}
                            aria-label={`Select ${submission.student_name ?? submission.user_id}`}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm ring-1 ring-border/60">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-3">
              Approval
              <Badge
                variant={isFeedbackOnly ? "secondary" : "destructive"}
                className={cn(
                  "gap-1 px-3 py-1 text-sm font-semibold",
                  isFeedbackOnly && "border-emerald-200 bg-emerald-50 text-emerald-800",
                )}
              >
                <AlertTriangle className="size-4" aria-hidden="true" />
                {isFeedbackOnly ? "Medium Risk" : "High Risk"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {previews[0]?.irreversible_warning ??
                (isFeedbackOnly
                  ? "Preview the feedback before sending. This will add a Canvas comment without changing the grade."
                  : "Preview the change before submitting. Grade updates affect official Canvas records.")}
            </div>
            <div className="flex items-start gap-2 rounded-md border p-3 text-sm">
              <History className="mt-0.5 size-4 text-primary" aria-hidden="true" />
              <span>
                {previews[0]?.rollback_message ??
                  "History details will be shown after preview."}
              </span>
            </div>
            {selectedUnsubmittedCount > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                {/* This warning intentionally does not disable preview: Canvas
                supports grading without an online upload for some assignments. */}
                {selectedUnsubmittedCount} selected student
                {selectedUnsubmittedCount === 1 ? " is" : "s are"} unsubmitted.
                You can still preview and submit if this assignment is paper-based,
                in-person, or otherwise gradeable without a Canvas upload.
              </div>
            )}
            {exceedsPointsPossible && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                {/* Over-max scores can be legitimate bonus/curve grades, so the
                typed confirmation remains the enforcement point. */}
                The proposed grade exceeds this assignment&apos;s{" "}
                {selectedAssignment?.points_possible} possible points. This is allowed
                for bonus or adjusted grading, but review carefully before approval.
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="reason">Feedback</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  setPreviews([]);
                  setError(null);
                }}
                placeholder="Feedback shown as a Canvas comment"
                aria-invalid={feedbackHasProfanity || undefined}
              />
              {feedbackHasProfanity ? (
                <p role="alert" className="text-sm text-destructive">
                  {STUDENT_COMMUNICATION_PROFANITY_MESSAGE}
                </p>
              ) : null}
            </div>
            {selectedSubmissions.length > 0 && (
              <p className="text-sm text-muted-foreground">
                Selected: {selectedSubmissions.length} student
                {selectedSubmissions.length === 1 ? "" : "s"}.
              </p>
            )}
            {previews.length > 0 && (
              <div className="space-y-2 rounded-md border p-3 text-sm">
                <p className="font-medium">
                  {previews.length === 1
                    ? previews[0].summary
                    : `Previewing ${previews.length} grade updates.`}
                </p>
                {previews[0].proposed.posted_grade ? (
                  <p>
                    Proposed grade: {previews[0].proposed.posted_grade}
                  </p>
                ) : (
                  <p>Feedback only: no grade change.</p>
                )}
              </div>
            )}
            {previewWarnings.length > 0 && (
              <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                {previewWarnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            )}
            {!previewMatchesSelection && (
              <p className="text-sm font-medium text-muted-foreground">
                {isFeedbackOnly
                  ? "Send feedback unlocks after you preview the selected feedback."
                  : "Submit unlocks only after you preview the selected changes and type UPDATE."}
                {" "}Refresh the preview after changing the grade, feedback, assignment, or selected students.
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={handlePreview}
              disabled={
                payloads.length === 0 ||
                (!hasGradeChange && !hasFeedback) ||
                Boolean(gradeValidationError) ||
                feedbackHasProfanity ||
                isSubmitting
              }
            >
              {isFeedbackOnly ? "Preview feedback" : "Preview change"}
            </Button>
            {!isFeedbackOnly && (
              <div className="space-y-2">
                <Label htmlFor="confirmation">Type UPDATE to approve</Label>
                <Input
                  id="confirmation"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </div>
            )}
            <Button
              className="mt-3"
              type="button"
              variant={isFeedbackOnly ? "default" : "destructive"}
              onClick={handleSubmit}
              disabled={
                !previewMatchesSelection ||
                (!isFeedbackOnly && confirmation !== "UPDATE") ||
                feedbackHasProfanity ||
                isSubmitting
              }
            >
              {isSubmitting
                ? "Submitting..."
                : isFeedbackOnly
                  ? "Send feedback"
                  : "Submit grade change"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
