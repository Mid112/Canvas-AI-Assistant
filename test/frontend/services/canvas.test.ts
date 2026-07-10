import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  CanvasApiError,
  updateCanvasToken,
  updateCanvasTokens,
  validateCanvasToken,
} from "@/services/canvas";

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
});
