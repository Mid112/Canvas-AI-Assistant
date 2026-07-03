import { afterEach, describe, expect, it, vi } from "vitest";

import { getInstitutionCanvasUrl } from "@/lib/institution-canvas";

describe("getInstitutionCanvasUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns undefined when VITE_CANVAS_UBC_URL is not set", () => {
    vi.unstubAllEnvs();

    expect(getInstitutionCanvasUrl("ubc")).toBeUndefined();
  });

  it("returns the configured env value when set", () => {
    vi.stubEnv("VITE_CANVAS_UBC_URL", "http://localhost:3000");

    expect(getInstitutionCanvasUrl("ubc")).toBe("http://localhost:3000");
  });
});
