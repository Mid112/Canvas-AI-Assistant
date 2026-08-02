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
          "No Canvas token for https://canvas.ubc.ca. Reconnect Canvas in Settings, then try again.",
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

describe("canvasConnectionRequiredMessage", () => {
  // Verifies: Hides raw API patch paths behind reconnect guidance.
  it("returns reconnect guidance for missing token errors", async () => {
    const { canvasConnectionRequiredMessage } = await import("@/lib/canvas-connection");

    expect(
      canvasConnectionRequiredMessage(
        new CanvasApiError(
          "No Canvas token for https://canvas.ubc.ca. Reconnect Canvas in Settings, then try again.",
          403,
        ),
      ),
    ).toBe(
      "Canvas is not connected for this institution. Reconnect Canvas in Settings, then try again.",
    );
  });

  // Verifies: Preserves Canvas admin permission guidance.
  it("preserves Canvas admin permission guidance", async () => {
    const { canvasConnectionRequiredMessage } = await import("@/lib/canvas-connection");
    const message =
      "Your Canvas token cannot create courses on any account. Ask an admin to grant course-creation permission.";

    expect(canvasConnectionRequiredMessage(new CanvasApiError(message, 403))).toBe(
      message,
    );
  });
});
