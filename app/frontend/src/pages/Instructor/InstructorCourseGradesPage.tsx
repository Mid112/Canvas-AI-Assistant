import { AlertTriangle, CheckCircle2, Loader2, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

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

export function InstructorCourseGradesPage() {
  const { localCourseId } = useParams();
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
  const [previews, setPreviews] = useState<GradePreview[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
          setAssignmentId(items[0]?.id ?? "");
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
  }, [accessToken, canvasUrl, course, parsedLocalCourseId, user?.has_canvas_token]);

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
          setSelectedUserIds(items.map((item) => item.user_id));
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
  }, [accessToken, assignmentId, canvasUrl, parsedLocalCourseId]);

  const selectedSubmissions = useMemo(
    () => submissions.filter((item) => selectedUserIds.includes(item.user_id)),
    [selectedUserIds, submissions],
  );

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
          current_submission: submission,
        }))
        : [],
    [assignmentId, postedGrade, reason, selectedSubmissions],
  );

  const allSelected =
    submissions.length > 0 && selectedUserIds.length === submissions.length;
  const previewByUserId = useMemo(
    () => new Map(previews.map((preview) => [preview.current.student_canvas_id, preview])),
    [previews],
  );
  const previewMatchesSelection =
    payloads.length > 0 &&
    previews.length === payloads.length &&
    payloads.every((payload) => {
      const preview = previewByUserId.get(payload.user_id);
      return preview?.proposed.posted_grade === payload.posted_grade;
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
    setSelectedUserIds(allSelected ? [] : submissions.map((item) => item.user_id));
    setPreviews([]);
  }

  async function handlePreview() {
    if (payloads.length === 0 || !accessToken) {
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
    if (payloads.length === 0 || !accessToken || confirmation !== "UPDATE") {
      return;
    }
    setIsSubmitting(true);
    try {
      const results = await Promise.all(
        payloads.map((payload) =>
          submitGradeUpdate(parsedLocalCourseId, payload, accessToken, canvasUrl),
        ),
      );
      setNotice(
        results.length === 1
          ? `Grade updated. History record #${results[0].history_id ?? "created"}.`
          : `${results.length} grades updated. History records created.`,
      );
      setPreviews([]);
      setConfirmation("");
      setPostedGrade("");
      if (assignmentId) {
        setSubmissions(
          await fetchAssignmentSubmissions(
            parsedLocalCourseId,
            assignmentId,
            accessToken,
            canvasUrl,
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
        <Badge variant="destructive" className="gap-1">
          <AlertTriangle className="size-3.5" aria-hidden="true" />
          High Risk
        </Badge>
      </div>

      {error && <p className="text-sm font-medium text-destructive">{error}</p>}
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
                  value={postedGrade}
                  onChange={(event) => {
                    setPostedGrade(event.target.value);
                    setPreviews([]);
                  }}
                  placeholder="92, A-, or complete/incomplete"
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
                    <TableHead className="w-28">
                      <label className="flex items-center gap-2 text-xs font-medium">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleAllStudents}
                        />
                        All
                      </label>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submissions.map((submission) => {
                    const preview = previewByUserId.get(submission.user_id);
                    return (
                      <TableRow key={submission.id}>
                        <TableCell className="font-medium">
                          {submission.student_name ?? `User ${submission.user_id}`}
                        </TableCell>
                        <TableCell className="capitalize">{submission.status}</TableCell>
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
            <CardTitle>Approval</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {previews[0]?.irreversible_warning ??
                "Preview the change before submitting. Grade updates affect official Canvas records."}
            </div>
            <div className="flex items-start gap-2 rounded-md border p-3 text-sm">
              <RotateCcw className="mt-0.5 size-4 text-primary" aria-hidden="true" />
              <span>
                {previews[0]?.rollback_message ??
                  "Rollback availability will be shown after preview."}
              </span>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">Reason</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  setPreviews([]);
                }}
                placeholder="Optional note for grade history"
              />
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
                <p>
                  Proposed grade: {previews[0].proposed.posted_grade}
                </p>
              </div>
            )}
            {!previewMatchesSelection && (
              <p className="text-sm font-medium text-muted-foreground">
                Preview is required before submit, and must be refreshed after changing
                the grade, reason, assignment, or selected students.
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={handlePreview}
              disabled={payloads.length === 0 || !postedGrade.trim() || isSubmitting}
            >
              Preview change
            </Button>
            <div className="space-y-2">
              <Label htmlFor="confirmation">Type UPDATE to approve</Label>
              <Input
                id="confirmation"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="destructive"
              onClick={handleSubmit}
              disabled={!previewMatchesSelection || confirmation !== "UPDATE" || isSubmitting}
            >
              {isSubmitting ? "Submitting..." : "Submit grade change"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
