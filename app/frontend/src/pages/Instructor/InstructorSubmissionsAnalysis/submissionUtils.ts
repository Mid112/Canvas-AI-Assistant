import type {
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

export function shouldShowMissingSection(status: SubmissionStatusFilter): boolean {
  return status === "all" || status === "missing";
}

export function shouldShowLateSection(status: SubmissionStatusFilter): boolean {
  return status === "all" || status === "late";
}
