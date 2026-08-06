// Test note: covers the submissions.test behavior so future changes can preserve the expected Canvas workflow contract.

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchAssignmentSubmissions,
  SubmissionApiError,
} from "@/services/submissions";

vi.mock("@/config/api", () => ({
  API_BASE_URL: "http://localhost:8000/api/v1",
}));

const submission = {
  id: 1,
  user_id: 2,
  submitted_at: "2026-10-01T12:00:00Z",
  score: 8,
  workflow_state: "submitted",
};

describe("submissions service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches assignment submissions", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [submission],
    } as Response);

    const result = await fetchAssignmentSubmissions(5, 1, "access-token");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/canvas/courses/5/assignments/1/submissions",
      expect.objectContaining({
        cache: "no-store",
        headers: { Authorization: "Bearer access-token" },
      }),
    );
    expect(result).toEqual([submission]);
  });

  it("appends canvas_url when fetching submissions", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [submission],
    } as Response);

    await fetchAssignmentSubmissions(
      5,
      1,
      "access-token",
      "https://canvas.university.edu",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/canvas/courses/5/assignments/1/submissions?canvas_url=https%3A%2F%2Fcanvas.university.edu",
      expect.any(Object),
    );
  });

  it("throws SubmissionApiError with a string detail message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ detail: "Submissions unavailable" }),
    } as Response);

    await expect(
      fetchAssignmentSubmissions(5, 1, "access-token"),
    ).rejects.toEqual(new SubmissionApiError("Submissions unavailable", 404));
  });

  it("throws SubmissionApiError with an array detail message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        detail: [{ msg: "Invalid assignment id" }],
      }),
    } as Response);

    await expect(
      fetchAssignmentSubmissions(5, 1, "access-token"),
    ).rejects.toEqual(new SubmissionApiError("Invalid assignment id", 422));
  });

  it("throws SubmissionApiError with a default message when parsing fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("invalid json");
      },
    } as Response);

    await expect(
      fetchAssignmentSubmissions(5, 1, "access-token"),
    ).rejects.toEqual(
      new SubmissionApiError("Something went wrong. Please try again.", 500),
    );
  });
});
