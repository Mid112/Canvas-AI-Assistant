import { paths } from "@/routes/paths";
import type { SubmissionStatusFilter } from "@/types/submission";

export function getSubmissionsAnalysisPath(options?: {
  assignmentId?: string;
  status?: SubmissionStatusFilter;
}): string {
  const params = new URLSearchParams();

  if (options?.assignmentId) {
    params.set("assignmentId", options.assignmentId);
  }

  if (options?.status && options.status !== "all") {
    params.set("status", options.status);
  }

  const query = params.toString();
  return query
    ? `${paths.instructor.analytics}?${query}`
    : paths.instructor.analytics;
}

export function parseSubmissionStatusFilter(
  value: string | null,
): SubmissionStatusFilter {
  if (value === "missing" || value === "late") {
    return value;
  }

  return "all";
}
