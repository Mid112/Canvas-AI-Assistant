import { describe, expect, it } from "vitest";

import { isCanvasConnectionRequiredError } from "@/lib/canvas-connection";
import { CanvasApiError } from "@/services/canvas";

describe("isCanvasConnectionRequiredError", () => {
  it("returns true for missing Canvas token responses", () => {
    expect(
      isCanvasConnectionRequiredError(
        new CanvasApiError(
          "No Canvas token for https://canvas.ubc.ca. PATCH to /api/v1/auth/me/canvas-token first.",
          403,
        ),
      ),
    ).toBe(true);
  });

  it("returns true for corrupted Canvas token responses", () => {
    expect(
      isCanvasConnectionRequiredError(
        new CanvasApiError("Canvas token is corrupted — please reconnect Canvas.", 403),
      ),
    ).toBe(true);
  });

  it("returns false for other API errors", () => {
    expect(
      isCanvasConnectionRequiredError(new CanvasApiError("Canvas unavailable", 503)),
    ).toBe(false);
  });
});
