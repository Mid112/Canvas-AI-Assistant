import { describe, expect, it } from "vitest";

import {
  feedbackDescribeSchema,
  feedbackReviewSchema,
} from "@/pages/Instructor/InstructorFeedbackCreate/feedbackCreateSchema";

describe("feedbackCreateSchema", () => {
  it("requires course, assignment, student, and prompt", () => {
    expect(
      feedbackDescribeSchema.safeParse({
        courseId: "",
        assignmentId: "",
        studentId: "",
        prompt: "short",
      }).success,
    ).toBe(false);
  });

  it("accepts a complete feedback review form", () => {
    const result = feedbackReviewSchema.safeParse({
      assignmentName: "Recursion Homework",
      studentName: "Alex Chen",
      newGrade: "85",
      feedback: "Strong work explaining the base case clearly.",
    });
    expect(result.success).toBe(true);
  });
});
