// Instructor page note: coordinates submission utils UI state with Canvas-backed services and active-course context.

import type {
  AssignmentSubmissionAnalysis,
  SubmissionStatusFilter,
  SubmissionStudent,
} from "@/types/submission";

export function filterSubmissionStudents(
  students: SubmissionStudent[],
  search: string,
): SubmissionStudent[] {
  const query = search.trim().toLowerCase();
  if (!query) {
    return students;
  }

  return students.filter(
    (student) =>
      student.name.toLowerCase().includes(query) ||
      student.email.toLowerCase().includes(query),
  );
}

export function filterSubmissionAssignments(
  assignments: AssignmentSubmissionAnalysis[],
  search: string,
): AssignmentSubmissionAnalysis[] {
  const query = search.trim().toLowerCase();
  if (!query) {
    return assignments;
  }

  return assignments.filter((assignment) =>
    assignment.label.toLowerCase().includes(query),
  );
}

export function shouldShowMissingSection(status: SubmissionStatusFilter): boolean {
  return status === "all" || status === "missing";
}

export function shouldShowLateSection(status: SubmissionStatusFilter): boolean {
  return status === "all" || status === "late";
}
