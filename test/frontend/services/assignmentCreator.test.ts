import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  approveAssignmentDraft,
  generateAssignmentDraft,
  previewAssignmentDraft,
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

  // Verifies: Maps reviewed form values into an API-ready create payload.
  it("maps reviewed form values into an API-ready create payload", () => {
    const result = toAssignmentCreateRequest({
      courseId: "3",
      name: "  Updated Quiz  ",
      description: "  Revised description.  ",
      dueDate: "2026-12-15T23:59",
      pointsPossible: 80,
    });

    expect(result.courseId).toBe(3);
    expect(result.assignment).toEqual({
      name: "Updated Quiz",
      description: "Revised description.",
      due_at: new Date("2026-12-15T23:59").toISOString(),
      points_possible: 80,
    });
  });

  // Verifies: Rejects invalid course ids.
  it("rejects invalid course ids", () => {
    expect(() =>
      toAssignmentCreateRequest({
        courseId: "",
        name: "Quiz",
        description: "Details",
        dueDate: "2026-12-15T23:59",
        pointsPossible: 100,
      }),
    ).toThrow("A valid course is required.");
  });

  // Verifies: Creates the assignment through the Canvas assignment API.
  it("creates the assignment through the Canvas assignment API", async () => {
    mockedCreateAssignment.mockResolvedValue({
      id: 10,
      name: "Updated Quiz",
      description: "Revised description.",
      due_at: new Date("2026-12-15T23:59").toISOString(),
      points_possible: 80,
      course_id: 123,
    });

    await approveAssignmentDraft(
      {
        courseId: "3",
        name: "  Updated Quiz  ",
        description: "  Revised description.  ",
        dueDate: "2026-12-15T23:59",
        pointsPossible: 80,
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
        points_possible: 80,
      },
      "access-token",
      "https://canvas.university.edu",
    );
  });
});

describe("generateAssignmentDraft", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls the backend draft generator and maps the response", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          title: "Recursion Practice Set",
          description: "Solve three recursion problems.",
          due_at: "2026-12-15T23:59:00+00:00",
          points_possible: 75,
        }),
        { status: 200 },
      ),
    );

    const draft = await generateAssignmentDraft(3, "Give me a recursion assignment", {
      accessToken: "access-token",
      canvasUrl: "https://canvas.university.edu",
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/canvas/courses/3/assignments/generate-draft"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ prompt: "Give me a recursion assignment" }),
      }),
    );
    expect(draft.name).toBe("Recursion Practice Set");
    expect(draft.description).toBe("Solve three recursion problems.");
    expect(draft.pointsPossible).toBe(75);
  });

  it("maps missing draft points to null instead of inventing 100", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          title: "Reading Check-in",
          description: "Ungraded reflection.",
          due_at: null,
          points_possible: null,
        }),
        { status: 200 },
      ),
    );

    const draft = await generateAssignmentDraft(3, "Ungraded reading check-in", {
      accessToken: "access-token",
    });

    expect(draft.pointsPossible).toBeNull();
  });

  it("throws AssignmentCreatorApiError on a failed response", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ detail: "Canvas token is invalid" }), {
        status: 401,
      }),
    );

    await expect(
      generateAssignmentDraft(3, "prompt", { accessToken: "access-token" }),
    ).rejects.toThrow("Canvas token is invalid");
  });
});

describe("previewAssignmentDraft", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls the backend preview endpoint and maps the response", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          summary:
            "Create assignment 'Quiz 1' in COSC 310, due Dec 15, 2026, worth 100 points.",
          reversible: true,
          affected_resources: [{ type: "assignment", name: "Quiz 1" }],
          metadata: {
            title: "Quiz 1",
            description_preview: "Details",
            due_date: "Dec 15, 2026",
            points_possible: "100 points",
          },
        }),
        { status: 200 },
      ),
    );

    const preview = await previewAssignmentDraft(
      {
        courseId: "3",
        name: "Quiz 1",
        description: "Details",
        dueDate: "2026-12-15T23:59",
        pointsPossible: 100,
      },
      { accessToken: "access-token", canvasUrl: "https://canvas.university.edu" },
    );

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/canvas/courses/3/assignments/preview"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(preview).toEqual({
      summary:
        "Create assignment 'Quiz 1' in COSC 310, due Dec 15, 2026, worth 100 points.",
      reversible: true,
      affectedResources: [{ type: "assignment", name: "Quiz 1" }],
      title: "Quiz 1",
      descriptionPreview: "Details",
      dueDate: "Dec 15, 2026",
      pointsPossible: "100 points",
    });
  });
});
