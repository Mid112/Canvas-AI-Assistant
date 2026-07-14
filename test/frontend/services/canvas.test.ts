import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  CanvasApiError,
  fetchActiveCourse,
  fetchCourses,
  removeCanvasConnection,
  setActiveCourse,
  updateCanvasConnections,
  updateCanvasToken,
  updateCanvasTokens,
  validateCanvasToken,
} from "@/services/canvas";

vi.mock("@/config/api", () => ({
  API_BASE_URL: "http://localhost:8000/api/v1",
}));

const tokenResponse = {
  id: 1,
  email: "professor@university.edu",
  is_active: true,
  has_canvas_token: true,
};

describe("canvas service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // Verifies: Sends a PATCH request with a single canvas token.
  it("sends a PATCH request with a single canvas token", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 1,
        email: "professor@university.edu",
        is_active: true,
        has_canvas_token: true,
      }),
    } as Response);

    const result = await updateCanvasToken("canvas-token-123", "jwt-token");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/auth/me/canvas-token",
      expect.objectContaining({
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer jwt-token",
        },
        body: JSON.stringify({ canvas_token: "canvas-token-123" }),
      }),
    );
    expect(result.has_canvas_token).toBe(true);
  });

  // Verifies: Sends one PATCH request per token when saving multiple tokens.
  it("sends one PATCH request per token when saving multiple tokens", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 1,
        email: "professor@university.edu",
        is_active: true,
        has_canvas_token: true,
      }),
    } as Response);

    await updateCanvasTokens(
      ["canvas-token-123", "canvas-token-456"],
      "jwt-token",
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: JSON.stringify({ canvas_token: "canvas-token-123" }),
    });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      body: JSON.stringify({ canvas_token: "canvas-token-456" }),
    });
  });

  // Verifies: Throws CanvasApiError when the request fails.
  it("throws CanvasApiError when the request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ detail: "Canvas token is required" }),
    } as Response);

    await expect(updateCanvasTokens([], "jwt-token")).rejects.toMatchObject({
      name: "CanvasApiError",
      status: 400,
      message: "Canvas token is required",
    });
  });

  // Verifies: Validates a canvas token through the backend proxy.
  it("validates a canvas token through the backend proxy", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: "valid" }),
    } as Response);

    const result = await validateCanvasToken("canvas-token-123", "jwt-token");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/auth/me/canvas-token/validate",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer jwt-token",
        },
        body: JSON.stringify({ canvas_token: "canvas-token-123" }),
      }),
    );
    expect(result).toBe("valid");
  });

  // Verifies: Returns expired when the backend reports an expired token.
  it("returns expired when the backend reports an expired token", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: "expired" }),
    } as Response);

    const result = await validateCanvasToken("expired-token", "jwt-token");

    expect(result).toBe("expired");
  });

  // Verifies: Returns invalid when the backend cannot validate the token.
  it("returns invalid when the backend cannot validate the token", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

    const result = await validateCanvasToken("bad-token", "jwt-token");

    expect(result).toBe("invalid");
  });

  it("includes canvas_url when updating a token", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => tokenResponse,
    } as Response);

    await updateCanvasToken(
      "canvas-token-123",
      "jwt-token",
      "https://canvas.university.edu",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/auth/me/canvas-token",
      expect.objectContaining({
        body: JSON.stringify({
          canvas_token: "canvas-token-123",
          canvas_url: "https://canvas.university.edu",
        }),
      }),
    );
  });

  it("saves multiple canvas connections", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => tokenResponse,
    } as Response);

    await updateCanvasConnections(
      [
        {
          canvasUrl: "https://canvas.ubc.ca",
          canvasToken: "token-1",
        },
        {
          canvasUrl: "https://canvas.ubco.ca",
          canvasToken: "token-2",
        },
      ],
      "jwt-token",
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects empty canvas connection updates", async () => {
    await expect(updateCanvasConnections([], "jwt-token")).rejects.toEqual(
      new CanvasApiError("Canvas token is required", 400),
    );
  });

  it("removes a saved canvas connection", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => ({}),
    } as Response);

    await removeCanvasConnection(10, "jwt-token");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/auth/me/canvas-connections/10",
      expect.objectContaining({
        method: "DELETE",
        headers: { Authorization: "Bearer jwt-token" },
      }),
    );
  });

  it("fetches canvas courses with an optional canvas_url", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [{ id: 1, name: "CS 101" }],
    } as Response);

    const courses = await fetchCourses(
      "jwt-token",
      "https://canvas.university.edu",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/canvas/courses?canvas_url=https%3A%2F%2Fcanvas.university.edu",
      expect.objectContaining({
        headers: { Authorization: "Bearer jwt-token" },
      }),
    );
    expect(courses).toHaveLength(1);
  });

  it("fetches and sets the active course", async () => {
    const activeCourse = {
      local_course_id: 3,
      name: "CS 101",
      canvas_course_id: 123,
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => activeCourse,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => activeCourse,
      } as Response);

    await expect(fetchActiveCourse("jwt-token")).resolves.toEqual(activeCourse);
    await expect(setActiveCourse(3, "jwt-token")).resolves.toEqual(activeCourse);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:8000/api/v1/canvas/active-course",
      expect.objectContaining({
        headers: { Authorization: "Bearer jwt-token" },
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:8000/api/v1/canvas/active-course",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ local_course_id: 3 }),
      }),
    );
  });

  it("throws CanvasApiError with a 404-specific message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ detail: "Not found" }),
    } as Response);

    await expect(fetchCourses("jwt-token")).rejects.toEqual(
      new CanvasApiError(
        "The requested API endpoint was not found. Make sure the backend is running.",
        404,
      ),
    );
  });

  it("returns invalid when token validation fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ detail: "Unauthorized" }),
    } as Response);

    await expect(
      validateCanvasToken("bad-token", "jwt-token", "https://canvas.university.edu"),
    ).resolves.toBe("invalid");
  });
});
