import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  previewGradeUpdate,
  submitGradeUpdate,
} from "@/services/gradeManagement";

vi.mock("@/config/api", () => ({
  API_BASE_URL: "http://localhost:8000/api/v1",
}));

const payload = {
  assignment_id: 10,
  user_id: 42,
  posted_grade: "88",
  reason: "Adjusted after rubric review",
  current_submission: {
    id: 99,
    assignment_id: 10,
    user_id: 42,
    student_name: "Ada Lovelace",
    submitted_at: null,
    workflow_state: "graded",
    status: "graded",
    score: 80,
    grade: "80",
    graded_at: null,
  },
};

describe("gradeManagement service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends preview payload with reason and current submission snapshot", async () => {
    // Covers stale-state protection inputs: preview sends the current submission
    // snapshot so the backend can compare what the instructor reviewed.
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ action: "update_grade" }),
    } as Response);

    await previewGradeUpdate(5, payload, "access-token", "https://canvas.test");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/canvas/courses/5/grades/preview?canvas_url=https%3A%2F%2Fcanvas.test",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer access-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }),
    );
  });

  it("posts the same grade payload to submit", async () => {
    // Covers mutation routing: submit uses the grade submit endpoint and keeps
    // the same body shape the preview already validated.
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ submitted: true }),
    } as Response);

    await submitGradeUpdate(5, payload, "access-token");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/canvas/courses/5/grades/submit",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );
  });
});
