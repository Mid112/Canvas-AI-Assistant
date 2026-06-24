import type {
  AssignmentSubmissionAnalysis,
  SubmissionStudent,
} from "@/types/submission";

function escapeCsvValue(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replaceAll('"', '""')}"`;
  }

  return value;
}

function formatMissingRow(student: SubmissionStudent): string {
  return [
    "missing",
    student.name,
    student.email,
    student.lastActive ?? "",
    "",
  ]
    .map(escapeCsvValue)
    .join(",");
}

function formatLateRow(student: SubmissionStudent): string {
  return ["late", student.name, student.email, "", student.lateBy ?? ""]
    .map(escapeCsvValue)
    .join(",");
}

export function buildSubmissionsExportCsv(
  assignment: AssignmentSubmissionAnalysis,
  missingStudents: SubmissionStudent[],
  lateStudents: SubmissionStudent[],
): string {
  const header = "status,name,email,last_active,late_by";
  const rows = [
    ...missingStudents.map(formatMissingRow),
    ...lateStudents.map(formatLateRow),
  ];

  return [
    escapeCsvValue(`${assignment.courseCode}: ${assignment.label}`),
    header,
    ...rows,
  ].join("\n");
}

export function downloadSubmissionsReport(
  assignment: AssignmentSubmissionAnalysis,
  missingStudents: SubmissionStudent[],
  lateStudents: SubmissionStudent[],
): void {
  const csv = buildSubmissionsExportCsv(
    assignment,
    missingStudents,
    lateStudents,
  );
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${assignment.id}-submissions-report.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
