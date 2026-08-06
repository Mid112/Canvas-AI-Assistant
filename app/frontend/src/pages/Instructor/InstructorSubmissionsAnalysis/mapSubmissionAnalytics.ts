import type { Assignment } from "@/types/assignment";
import type { InstructorCourse } from "@/types/course";
import type {
  ApiSubmission,
  AssignmentSubmissionAnalysis,
  SubmissionStudent,
} from "@/types/submission";
import { formatDueDateForDisplay } from "@/lib/assignment-utils";

const AVATAR_COLORS = [
  "bg-sky-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-rose-500",
  "bg-amber-500",
  "bg-cyan-500",
] as const;

function mapSubmissionStudent(
  submission: ApiSubmission,
  index: number,
  options?: { includeSubmittedAt?: boolean },
): SubmissionStudent {
  return {
    id: String(submission.user_id),
    name: submission.student_name ?? `Student ${submission.user_id}`,
    email: submission.student_email ?? "",
    avatarColor: AVATAR_COLORS[index % AVATAR_COLORS.length]!,
    lateBy:
      options?.includeSubmittedAt && submission.submitted_at
        ? formatDueDateForDisplay(submission.submitted_at)
        : undefined,
  };
}

export function mapApiSubmissionsToAnalysis(
  assignment: Assignment,
  course: InstructorCourse,
  submissions: ApiSubmission[],
): AssignmentSubmissionAnalysis {
  const missingSubmissions = submissions
    .filter(
      (submission) =>
        submission.status === "missing" || submission.status === "unsubmitted",
    )
    .map((submission, index) => mapSubmissionStudent(submission, index));

  const lateSubmissions = submissions
    .filter((submission) => submission.status === "late")
    .map((submission, index) =>
      mapSubmissionStudent(submission, index, { includeSubmittedAt: true }),
    );

  const submittedCount = submissions.filter(
    (submission) =>
      submission.status !== "missing" && submission.status !== "unsubmitted",
  ).length;
  const submissionRate = submissions.length
    ? Math.round((submittedCount / submissions.length) * 100)
    : 0;

  return {
    id: String(assignment.id),
    courseId: course.id,
    label: assignment.name,
    courseCode: course.code,
    submissionRate,
    missingSubmissions,
    lateSubmissions,
    aiSummary: {
      keyInsights: `${missingSubmissions.length} students have not submitted and ${lateSubmissions.length} submitted late for ${assignment.name}.`,
      recommendation:
        missingSubmissions.length > 0
          ? "Send a reminder to students with missing submissions."
          : "No immediate follow-up is required for missing work.",
      lateSubmissionsNote:
        lateSubmissions.length > 0
          ? `${lateSubmissions.length} late submissions may need review.`
          : "No late submissions for this assignment.",
    },
  };
}

export function createAssignmentPlaceholder(
  assignment: Assignment,
  course: InstructorCourse,
): AssignmentSubmissionAnalysis {
  return {
    id: String(assignment.id),
    courseId: course.id,
    label: assignment.name,
    courseCode: course.code,
    submissionRate: 0,
    missingSubmissions: [],
    lateSubmissions: [],
    aiSummary: {
      keyInsights: "Loading submission insights...",
      recommendation: "Select an assignment to view recommendations.",
      lateSubmissionsNote: "Late submission trends will appear here.",
    },
  };
}
