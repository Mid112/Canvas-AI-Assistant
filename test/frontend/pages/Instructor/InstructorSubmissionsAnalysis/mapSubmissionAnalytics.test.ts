import { describe, expect, it } from "vitest";

import { formatDueDateForDisplay } from "@/lib/assignment-utils";
import { mapApiSubmissionsToAnalysis } from "@/pages/Instructor/InstructorSubmissionsAnalysis/mapSubmissionAnalytics";
import type { Assignment } from "@/types/assignment";
import type { InstructorCourse } from "@/types/course";
import type { ApiSubmission } from "@/types/submission";

const assignment: Assignment = {
  id: 42,
  name: "Baking 101 Lab",
  description: null,
  due_at: "2026-01-01T00:00:00Z",
  points_possible: 100,
  course_id: 1,
  published: true,
};

const course: InstructorCourse = {
  id: 7,
  code: "COSC 499",
  name: "Capstone",
  progress: 0,
  studentCount: 2,
  assignmentCount: 1,
  lastActivity: "",
  isPublished: true,
  isWritable: true,
  term: "Fall 2026",
};

describe("mapApiSubmissionsToAnalysis", () => {
  // Verifies: Late rows expose submitted-at (and email) for the Analytics Submitted column.
  it("maps submitted_at onto lateBy for late submissions", () => {
    const submittedAt = "2026-01-03T18:00:00Z";
    const submissions: ApiSubmission[] = [
      {
        id: 1,
        assignment_id: 42,
        user_id: 1001,
        student_name: "Ada Lovelace",
        student_email: "ada@example.com",
        student_login_id: null,
        submitted_at: submittedAt,
        workflow_state: "submitted",
        status: "late",
        score: null,
        grade: null,
        graded_at: null,
      },
      {
        id: 2,
        assignment_id: 42,
        user_id: 1002,
        student_name: "Grace Hopper",
        student_email: "grace@example.com",
        student_login_id: null,
        submitted_at: null,
        workflow_state: "unsubmitted",
        status: "missing",
        score: null,
        grade: null,
        graded_at: null,
      },
    ];

    const analysis = mapApiSubmissionsToAnalysis(assignment, course, submissions);

    expect(analysis.lateSubmissions).toHaveLength(1);
    expect(analysis.lateSubmissions[0]).toMatchObject({
      name: "Ada Lovelace",
      email: "ada@example.com",
      lateBy: formatDueDateForDisplay(submittedAt),
    });
    expect(analysis.missingSubmissions).toHaveLength(1);
    expect(analysis.missingSubmissions[0]?.lateBy).toBeUndefined();
    expect(analysis.missingSubmissions[0]?.email).toBe("grace@example.com");
  });
});
