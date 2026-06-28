import { paths } from "@/routes/paths";
import type {
  AssignmentSubmissionAnalysis,
  SubmissionStatusFilter,
} from "@/types/submission";

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
  const base = paths.instructor.courseAnalytics(courseId);

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

  if (import.meta.env.DEV) {
    return assignments.filter((assignment) => assignment.courseId === 1);
  }

  return [];
}

export function usesSampleSubmissionData(
  assignments: AssignmentSubmissionAnalysis[],
  courseId: number,
): boolean {
  return (
    assignments.length > 0 &&
    assignments.every((assignment) => assignment.courseId !== courseId)
  );
}
