import { describe, expect, it } from "vitest";

import {
  assignmentDescribeSchema,
  assignmentReviewSchema,
} from "@/pages/Instructor/InstructorAssignmentCreate/assignmentCreateSchema";

describe("assignmentDescribeSchema", () => {
  it("requires course and a detailed prompt", () => {
    const result = assignmentDescribeSchema.safeParse({
      courseId: "",
      prompt: "too short",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.courseId).toBeDefined();
      expect(result.error.flatten().fieldErrors.prompt).toBeDefined();
    }
  });

  it("accepts valid describe values", () => {
    const result = assignmentDescribeSchema.safeParse({
      courseId: "1",
      prompt: "Create a quiz on Python functions and parameters for beginners.",
    });

    expect(result.success).toBe(true);
  });
});

describe("assignmentReviewSchema", () => {
  it("rejects empty title and description", () => {
    const result = assignmentReviewSchema.safeParse({
      name: "   ",
      description: "",
      dueDate: "2026-12-15T12:00",
    });

    expect(result.success).toBe(false);
  });

  it("rejects due dates in the past", () => {
    const result = assignmentReviewSchema.safeParse({
      name: "Quiz",
      description: "A short quiz.",
      dueDate: "2020-01-01T12:00",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.dueDate?.[0]).toMatch(/future/i);
    }
  });
});
