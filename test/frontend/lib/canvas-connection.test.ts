import { describe, expect, it } from "vitest";

import { isCanvasConnectionRequiredError } from "@/lib/canvas-connection";
import { CanvasApiError } from "@/services/canvas";
import { SubmissionApiError } from "@/services/submissions";

describe("isCanvasConnectionRequiredError", () => {
  // Verifies: Returns true for missing Canvas token responses.
  it("returns true for missing Canvas token responses", () => {
    expect(
      isCanvasConnectionRequiredError(
        new CanvasApiError(
          "No Canvas token for https://canvas.example.edu. PATCH to /api/v1/auth/me/canvas-token first.",
          403,
        ),
      ),
    ).toBe(true);
  });

  // Verifies: Returns true for corrupted Canvas token responses.
  it("returns true for corrupted Canvas token responses", () => {
    expect(
      isCanvasConnectionRequiredError(
        new CanvasApiError("Canvas token is corrupted — please reconnect Canvas.", 403),
      ),
    ).toBe(true);
  });

  // Verifies: Returns true for invalid Canvas token responses.
  it("returns true for invalid Canvas token responses", () => {
    expect(
      isCanvasConnectionRequiredError(
        new CanvasApiError("Invalid Canvas API token", 422),
      ),
    ).toBe(true);
    expect(
      isCanvasConnectionRequiredError(
        new SubmissionApiError("Invalid Canvas API token", 422),
      ),
    ).toBe(true);
  });

  // Verifies: Returns true for lowercase invalid canvas token messages.
  it("returns true for lowercase invalid canvas token messages", () => {
    expect(
      isCanvasConnectionRequiredError(
        new CanvasApiError("invalid canvas token", 403),
      ),
    ).toBe(true);
  });

  // Verifies: Returns false for other API errors.
  it("returns false for other API errors", () => {
    expect(
      isCanvasConnectionRequiredError(new CanvasApiError("Canvas unavailable", 503)),
    ).toBe(false);
  });
});
