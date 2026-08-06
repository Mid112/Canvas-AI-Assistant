// Instructor page note: coordinates submission navigation UI state with Canvas-backed services and active-course context.

import type {
  AssignmentSubmissionAnalysis,
  SubmissionStatusFilter,
} from "@/types/submission";
import { instructorCourseAnalyticsPath } from "@/routes/paths";

export function getCourseAnalyticsPath(
  courseId: number,
  options?: {
    assignmentId?: string;
    status?: SubmissionStatusFilter;
  },
): string {
  const params = new URLSearchParams();

  if (options?.assignmentId) {
    params.set("assignmentId", options.assignmentId);
  }

  if (options?.status && options.status !== "all") {
    params.set("status", options.status);
  }

  const query = params.toString();
  const base = instructorCourseAnalyticsPath(courseId);

  return query ? `${base}?${query}` : base;
}

export function parseSubmissionStatusFilter(
  value: string | null,
): SubmissionStatusFilter {
  if (value === "missing" || value === "late") {
    return value;
  }

  return "all";
}

export function normalizeCourseCode(code: string): string {
  return code.trim().toLowerCase().replace(/\s+/g, " ");
}

export function getCourseAssignments(
  assignments: AssignmentSubmissionAnalysis[],
  course: { id: number; code: string },
): AssignmentSubmissionAnalysis[] {
  const byId = assignments.filter(
    (assignment) => assignment.courseId === course.id,
  );
  if (byId.length > 0) {
    return byId;
  }

  const normalizedCode = normalizeCourseCode(course.code);
  const byCode = assignments.filter(
    (assignment) =>
      normalizeCourseCode(assignment.courseCode) === normalizedCode,
  );
  if (byCode.length > 0) {
    return byCode;
  }

  return [];
}

export function resolveEffectiveAssignmentId(
  assignments: AssignmentSubmissionAnalysis[],
  selectedAssignmentId: string,
  assignmentIdFromUrl: string | null,
): string {
  if (selectedAssignmentId) {
    const userSelection = assignments.find(
      (assignment) => assignment.id === selectedAssignmentId,
    );
    if (userSelection) {
      return userSelection.id;
    }
  }

  if (assignmentIdFromUrl) {
    const fromUrl = assignments.find(
      (assignment) => assignment.id === assignmentIdFromUrl,
    );
    if (fromUrl) {
      return fromUrl.id;
    }
  }

  return assignments[0]?.id ?? "";
}

/** Resolve assignment id from Canvas list + UI selection (not submission analysis state). */
export function resolveEffectiveCanvasAssignmentId(
  canvasAssignments: { id: number }[],
  selectedAssignmentId: string,
  assignmentIdFromUrl: string | null,
): string {
  const ids = new Set(canvasAssignments.map((assignment) => String(assignment.id)));

  if (selectedAssignmentId && ids.has(selectedAssignmentId)) {
    return selectedAssignmentId;
  }

  if (assignmentIdFromUrl && ids.has(assignmentIdFromUrl)) {
    return assignmentIdFromUrl;
  }

  return canvasAssignments[0] ? String(canvasAssignments[0].id) : "";
}

export function usesSampleSubmissionData(
  assignments: AssignmentSubmissionAnalysis[],
  courseId: number,
): boolean {
  // True when mock assignments were matched by course code (or dev fallback) rather
  // than the URL course id — used to show a banner until Canvas data replaces mocks.
  return (
    assignments.length > 0 &&
    assignments.every((assignment) => assignment.courseId !== courseId)
  );
}
