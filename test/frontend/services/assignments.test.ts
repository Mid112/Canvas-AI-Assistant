import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AssignmentApiError,
  createAssignment,
  fetchAssignment,
  fetchCourseAssignments,
  updateAssignment,
} from "@/services/assignments";

vi.mock("@/config/api", () => ({
  API_BASE_URL: "http://localhost:8000/api/v1",
}));

const assignment = {
  id: 1,
  title: "Quiz 1",
  due_at: "2026-10-01T00:00:00Z",
  points_possible: 10,
  published: true,
};

describe("assignments service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches course assignments", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [assignment],
    } as Response);

    const result = await fetchCourseAssignments(5, "access-token");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/canvas/courses/5/assignments",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    expect(result).toEqual([assignment]);
  });

  it("appends canvas_url when fetching course assignments", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [assignment],
    } as Response);

    await fetchCourseAssignments(
      5,
      "access-token",
      "https://canvas.university.edu",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/canvas/courses/5/assignments?canvas_url=https%3A%2F%2Fcanvas.university.edu",
      expect.any(Object),
    );
  });

  it("fetches a single assignment", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => assignment,
    } as Response);

    const result = await fetchAssignment(5, 1, "access-token");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/canvas/courses/5/assignments/1",
      expect.any(Object),
    );
    expect(result).toEqual(assignment);
  });

  it("creates an assignment", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => assignment,
    } as Response);
    const payload = { title: "Quiz 1", points_possible: 10 };

    await createAssignment(5, payload, "access-token");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/canvas/courses/5/assignments",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );
  });

  it("updates an assignment", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => assignment,
    } as Response);
    const payload = { title: "Updated Quiz" };

    await updateAssignment(5, 1, payload, "access-token");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/canvas/courses/5/assignments/1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    );
  });

  it("throws AssignmentApiError with a string detail message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ detail: "Assignment not found" }),
    } as Response);

    await expect(fetchAssignment(5, 1, "access-token")).rejects.toEqual(
      new AssignmentApiError("Assignment not found", 400),
    );
  });

  it("throws AssignmentApiError with an array detail message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        detail: [{ msg: "Title is required" }],
      }),
    } as Response);

    await expect(fetchAssignment(5, 1, "access-token")).rejects.toEqual(
      new AssignmentApiError("Title is required", 422),
    );
  });

  it("throws AssignmentApiError with a default message when parsing fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("invalid json");
      },
    } as Response);

    await expect(fetchAssignment(5, 1, "access-token")).rejects.toEqual(
      new AssignmentApiError("Something went wrong. Please try again.", 500),
    );
  });
});
