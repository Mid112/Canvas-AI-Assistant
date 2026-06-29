import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  CanvasApiError,
  fetchActiveCourse,
  setActiveCourse,
  updateCanvasToken,
  updateCanvasTokens,
  validateCanvasToken,
} from "@/services/canvas";

describe("canvas service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

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

  it("returns expired when the backend reports an expired token", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: "expired" }),
    } as Response);

    const result = await validateCanvasToken("expired-token", "jwt-token");

    expect(result).toBe("expired");
  });

  it("returns invalid when the backend cannot validate the token", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

    const result = await validateCanvasToken("bad-token", "jwt-token");

    expect(result).toBe("invalid");
  });

  it("fetches the active course", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        local_id: 3,
        canvas_course_id: "101",
        canvas_url: "https://canvas.example.edu",
        name: "CS 101",
        term: "2026W1",
      }),
    } as Response);

    const result = await fetchActiveCourse("jwt-token");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/canvas/active-course",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer jwt-token",
        },
      }),
    );
    expect(result?.local_id).toBe(3);
  });

  it("sets the active course", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        local_id: 5,
        canvas_course_id: "205",
        canvas_url: "https://canvas.example.edu",
        name: "CS 205",
        term: null,
      }),
    } as Response);

    const result = await setActiveCourse(5, "jwt-token");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/canvas/active-course",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ local_course_id: 5 }),
      }),
    );
    expect(result.name).toBe("CS 205");
  });
});
