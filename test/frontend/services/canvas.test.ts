import { describe, expect, it, vi, beforeEach } from "vitest";

import { CanvasApiError, updateCanvasToken } from "@/services/canvas";

describe("canvas service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends a PATCH request with the canvas token", async () => {
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

  it("throws CanvasApiError when the request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ detail: "Canvas token is required" }),
    } as Response);

    await expect(updateCanvasToken(" ", "jwt-token")).rejects.toMatchObject({
      name: "CanvasApiError",
      status: 400,
      message: "Canvas token is required",
    });
  });
});
