import { describe, expect, it } from "vitest";

import { canvasUrlsEquivalent, normalizeCanvasUrl, toBrowserCanvasUrl, validateCanvasUrl } from "@/lib/canvas-url";

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

describe("canvasUrlsEquivalent", () => {
  it("treats local docker aliases as the same host", () => {
    expect(canvasUrlsEquivalent("http://localhost:3000", "http://canvas_lms:3000")).toBe(
      true,
    );
    expect(canvasUrlsEquivalent("http://127.0.0.1:3000", "http://localhost:3000")).toBe(
      true,
    );
  });

  it("does not equate different public hosts", () => {
    expect(
      canvasUrlsEquivalent("https://canvas.ubc.ca", "https://canvas.example.edu"),
    ).toBe(false);
  });
});

describe("toBrowserCanvasUrl", () => {
  it("rewrites docker-internal canvas hosts for browser links", () => {
    expect(toBrowserCanvasUrl("http://canvas_lms:3000")).toBe(
      "http://localhost:3000",
    );
  });

  it("leaves public canvas URLs unchanged", () => {
    expect(toBrowserCanvasUrl("https://canvas.university.edu/")).toBe(
      "https://canvas.university.edu",
    );
  });
});
