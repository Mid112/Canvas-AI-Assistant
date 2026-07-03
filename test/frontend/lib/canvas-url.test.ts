import { describe, expect, it } from "vitest";

import { normalizeCanvasUrl, validateCanvasUrl } from "@/lib/canvas-url";

describe("validateCanvasUrl", () => {
  it("accepts https URLs", () => {
    expect(validateCanvasUrl("https://canvas.university.edu/")).toBeNull();
    expect(normalizeCanvasUrl("https://canvas.university.edu/")).toBe(
      "https://canvas.university.edu",
    );
  });

  it("rejects empty and non-https URLs", () => {
    expect(validateCanvasUrl("")).toBe("Canvas URL is required");
    expect(validateCanvasUrl("http://example.com")).toBe(
      "Canvas URL must be an https:// URL",
    );
  });
});
