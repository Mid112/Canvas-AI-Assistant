// Test note: covers the feedback create schema.test behavior so future changes can preserve the expected Canvas workflow contract.

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

  it("rejects feedback comments that contain profanity", () => {
    const result = feedbackReviewSchema.safeParse({
      assignmentName: "Recursion Homework",
      studentName: "Alex Chen",
      newGrade: "85",
      feedback: "This is fucking inappropriate feedback",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/appropriate/i);
    }
  });
});
