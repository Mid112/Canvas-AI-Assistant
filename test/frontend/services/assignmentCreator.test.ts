import { describe, expect, it } from "vitest";

import { toAssignmentCreateRequest } from "@/services/assignmentCreator";

describe("toAssignmentCreateRequest", () => {
  it("maps reviewed form values into an API-ready create payload", () => {
    const result = toAssignmentCreateRequest({
      courseId: "3",
      name: "  Updated Quiz  ",
      description: "  Revised description.  ",
      dueDate: "2026-12-15T23:59",
    });

    expect(result.courseId).toBe(3);
    expect(result.assignment).toEqual({
      name: "Updated Quiz",
      description: "Revised description.",
      due_at: new Date("2026-12-15T23:59").toISOString(),
    });
  });

  it("rejects invalid course ids", () => {
    expect(() =>
      toAssignmentCreateRequest({
        courseId: "",
        name: "Quiz",
        description: "Details",
        dueDate: "2026-12-15T23:59",
      }),
    ).toThrow("A valid course is required.");
  });
});
