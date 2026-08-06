// Test note: covers the assignment create schema.test behavior so future changes can preserve the expected Canvas workflow contract.

import { describe, expect, it } from "vitest";

import {
  assignmentDescribeSchema,
  assignmentReviewSchema,
} from "@/pages/Instructor/InstructorAssignmentCreate/assignmentCreateSchema";

describe("assignmentDescribeSchema", () => {
  // Verifies: Requires course and a detailed prompt.
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

  // Verifies: Accepts valid describe values.
  it("accepts valid describe values", () => {
    const result = assignmentDescribeSchema.safeParse({
      courseId: "1",
      prompt: "Create a quiz on Python functions and parameters for beginners.",
    });

    expect(result.success).toBe(true);
  });
});

describe("assignmentReviewSchema", () => {
  // Verifies: Rejects empty title and description.
  it("rejects empty title and description", () => {
    const result = assignmentReviewSchema.safeParse({
      name: "   ",
      description: "",
      dueDate: "2026-12-15T12:00",
      pointsPossible: 100,
    });

    expect(result.success).toBe(false);
  });

  // Verifies: Rejects due dates in the past.
  it("rejects due dates in the past", () => {
    const result = assignmentReviewSchema.safeParse({
      name: "Quiz",
      description: "A short quiz.",
      dueDate: "2020-01-01T12:00",
      pointsPossible: 100,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.dueDate?.[0]).toMatch(/future/i);
    }
  });

  it("accepts a fully valid review payload", () => {
    const result = assignmentReviewSchema.safeParse({
      name: "Quiz",
      description: "A short quiz.",
      dueDate: "2026-12-15T12:00",
      pointsPossible: 100,
    });

    expect(result.success).toBe(true);
  });

  // Verifies: Ticket 21 — blank/null points create an ungraded assignment.
  it("accepts null points possible for ungraded assignments", () => {
    const result = assignmentReviewSchema.safeParse({
      name: "Reading reflection",
      description: "Ungraded check-in.",
      dueDate: "2026-12-15T12:00",
      pointsPossible: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pointsPossible).toBeNull();
    }
  });

  it("treats empty points input as ungraded null", () => {
    const result = assignmentReviewSchema.safeParse({
      name: "Reading reflection",
      description: "Ungraded check-in.",
      dueDate: "2026-12-15T12:00",
      pointsPossible: Number.NaN,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pointsPossible).toBeNull();
    }
  });

  it("rejects zero or negative points possible", () => {
    const result = assignmentReviewSchema.safeParse({
      name: "Quiz",
      description: "A short quiz.",
      dueDate: "2026-12-15T12:00",
      pointsPossible: 0,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.pointsPossible?.[0]).toMatch(
        /greater than 0/i,
      );
    }
  });
});
