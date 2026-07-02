import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  approveAssignmentDraft,
  toAssignmentCreateRequest,
} from "@/services/assignmentCreator";
import { createAssignment } from "@/services/assignments";

vi.mock("@/services/assignments", () => ({
  createAssignment: vi.fn(),
}));

const mockedCreateAssignment = vi.mocked(createAssignment);

describe("toAssignmentCreateRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it("creates the assignment through the Canvas assignment API", async () => {
    mockedCreateAssignment.mockResolvedValue({
      id: 10,
      name: "Updated Quiz",
      description: "Revised description.",
      due_at: new Date("2026-12-15T23:59").toISOString(),
      points_possible: null,
      course_id: 123,
    });

    await approveAssignmentDraft(
      {
        courseId: "3",
        name: "  Updated Quiz  ",
        description: "  Revised description.  ",
        dueDate: "2026-12-15T23:59",
      },
      {
        accessToken: "access-token",
        canvasUrl: "https://canvas.university.edu",
      },
    );

    expect(mockedCreateAssignment).toHaveBeenCalledWith(
      3,
      {
        name: "Updated Quiz",
        description: "Revised description.",
        due_at: new Date("2026-12-15T23:59").toISOString(),
      },
      "access-token",
      "https://canvas.university.edu",
    );
  });
});
