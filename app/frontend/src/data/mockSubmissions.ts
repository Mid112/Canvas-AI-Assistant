import type { ApiSubmission } from "@/types/submission";

const sampleSubmissions: ApiSubmission[] = [
  {
    id: 1,
    assignment_id: 101,
    user_id: 1001,
    student_name: "Alex Thompson",
    submitted_at: "2026-06-20T18:30:00Z",
    workflow_state: "graded",
    status: "graded",
    score: 92,
    grade: "A-",
    graded_at: "2026-06-21T10:00:00Z",
  },
  {
    id: 2,
    assignment_id: 101,
    user_id: 1002,
    student_name: "Maria Garcia",
    submitted_at: "2026-06-22T23:45:00Z",
    workflow_state: "submitted",
    status: "late",
    score: null,
    grade: null,
    graded_at: null,
  },
  {
    id: 3,
    assignment_id: 101,
    user_id: 1003,
    student_name: "Emma Davis",
    submitted_at: null,
    workflow_state: "unsubmitted",
    status: "missing",
    score: null,
    grade: null,
    graded_at: null,
  },
  {
    id: 4,
    assignment_id: 101,
    user_id: 1004,
    student_name: "Ryan Martinez",
    submitted_at: "2026-06-19T14:00:00Z",
    workflow_state: "submitted",
    status: "submitted",
    score: null,
    grade: null,
    graded_at: null,
  },
];

/** Sample submissions used when Canvas is not connected. */
export function getMockAssignmentSubmissions(
  assignmentId: number,
): ApiSubmission[] {
  return sampleSubmissions.map((submission) => ({
    ...submission,
    assignment_id: assignmentId,
  }));
}

export const mockAssignmentName = "Programming Assignment 3: Loops";
