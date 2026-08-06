// Instructor page note: coordinates submission export UI state with Canvas-backed services and active-course context.

import type {
  AssignmentSubmissionAnalysis,
  SubmissionStudent,
} from "@/types/submission";

function escapeCsvValue(value: string): string {
  let escaped = value;

  // Prefix spreadsheet formula characters so Excel/Sheets do not execute cell values.
  if (/^[=+\-@]/.test(escaped)) {
    escaped = `'${escaped}`;
  }

  if (escaped.includes(",") || escaped.includes('"') || escaped.includes("\n")) {
    return `"${escaped.replaceAll('"', '""')}"`;
  }

  return escaped;
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
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
