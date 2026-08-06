// Test note: covers the institution canvas.test behavior so future changes can preserve the expected Canvas workflow contract.

import { afterEach, describe, expect, it, vi } from "vitest";

import { getInstitutionCanvasUrl } from "@/lib/institution-canvas";

describe("getInstitutionCanvasUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Verifies: Returns undefined when VITE_CANVAS_UBC_URL is not set.
  it("returns undefined when VITE_CANVAS_UBC_URL is not set", () => {
    vi.unstubAllEnvs();

    expect(getInstitutionCanvasUrl("ubc")).toBeUndefined();
  });

  // Verifies: Returns the configured env value when set.
  it("returns the configured env value when set", () => {
    vi.stubEnv("VITE_CANVAS_UBC_URL", "http://localhost:3000");

    expect(getInstitutionCanvasUrl("ubc")).toBe("http://localhost:3000");
  });
});
