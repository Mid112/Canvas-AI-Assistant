import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  CanvasApiError,
  updateCanvasTokens,
  validateCanvasToken,
} from "@/services/canvas";

describe("canvas service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends a PATCH request with canvas tokens", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 1,
        email: "professor@university.edu",
        is_active: true,
        has_canvas_token: true,
      }),
    } as Response);

    const result = await updateCanvasTokens(
      ["canvas-token-123", "canvas-token-456"],
      "jwt-token",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/auth/me/canvas-token",
      expect.objectContaining({
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer jwt-token",
        },
        body: JSON.stringify({
          canvas_tokens: ["canvas-token-123", "canvas-token-456"],
        }),
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

    await expect(updateCanvasTokens([], "jwt-token")).rejects.toMatchObject({
      name: "CanvasApiError",
      status: 400,
      message: "Canvas token is required",
    });
  });

  it("validates a canvas token against the Canvas API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);

    const result = await validateCanvasToken("canvas-token-123");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://canvas.ubc.ca/api/v1/users/self",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer canvas-token-123",
        },
      }),
    );
    expect(result).toBe("valid");
  });

  it("returns expired when Canvas responds with 401", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 401,
    } as Response);

    const result = await validateCanvasToken("expired-token");

    expect(result).toBe("expired");
  });

  it("returns invalid when Canvas cannot be reached", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

    const result = await validateCanvasToken("bad-token");

    expect(result).toBe("invalid");
  });
});
