import { describe, expect, it } from "vitest";

import { canvasUrlsEquivalent, normalizeCanvasUrl, toBrowserCanvasUrl, validateCanvasUrl } from "@/lib/canvas-url";

describe("validateCanvasUrl", () => {
  // Verifies: Accepts https URLs.
  it("accepts https URLs", () => {
    expect(validateCanvasUrl("https://canvas.university.edu/")).toBeNull();
    expect(normalizeCanvasUrl("https://canvas.university.edu/")).toBe(
      "https://canvas.university.edu",
    );
  });

  // Verifies: Rejects empty and non-https URLs.
  it("rejects empty and non-https URLs", () => {
    expect(validateCanvasUrl("")).toBe("Canvas URL is required");
    expect(validateCanvasUrl("http://example.com")).toBe(
      "Canvas URL must be an https:// URL",
    );
  });
});

describe("canvasUrlsEquivalent", () => {
  // Verifies: Treats local docker aliases as the same host.
  it("treats local docker aliases as the same host", () => {
    expect(canvasUrlsEquivalent("http://localhost:3000", "http://canvas_lms:3000")).toBe(
      true,
    );
    expect(canvasUrlsEquivalent("http://127.0.0.1:3000", "http://localhost:3000")).toBe(
      true,
    );
  });

  // Verifies: Does not equate different public hosts.
  it("does not equate different public hosts", () => {
    expect(
      canvasUrlsEquivalent("https://canvas.ubc.ca", "https://canvas.example.edu"),
    ).toBe(false);
  });
});

describe("toBrowserCanvasUrl", () => {
  // Verifies: Rewrites docker-internal canvas hosts for browser links.
  it("rewrites docker-internal canvas hosts for browser links", () => {
    expect(toBrowserCanvasUrl("http://canvas_lms:3000")).toBe(
      "http://localhost:3000",
    );
  });

  // Verifies: Leaves public canvas URLs unchanged.
  it("leaves public canvas URLs unchanged", () => {
    expect(toBrowserCanvasUrl("https://canvas.university.edu/")).toBe(
      "https://canvas.university.edu",
    );
  });
});
