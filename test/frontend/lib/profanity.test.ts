// Test note: covers the profanity.test behavior so future changes can preserve the expected Canvas workflow contract.

import { describe, expect, it } from "vitest";

import { containsProfanity } from "@/lib/profanity";

describe("containsProfanity", () => {
  it("detects blocked terms case-insensitively", () => {
    expect(containsProfanity("This is fucking inappropriate")).toBe(true);
    expect(containsProfanity("SHIT happens")).toBe(true);
  });

  it("detects plurals and common suffixes", () => {
    expect(containsProfanity("Ignore the bastards")).toBe(true);
    expect(containsProfanity("Those dicks")).toBe(true);
    expect(containsProfanity("sluts and whores")).toBe(true);
  });

  it("detects spaced, punctuated, zero-width, and lookalike bypasses", () => {
    expect(containsProfanity("f u c k")).toBe(true);
    expect(containsProfanity("f.u.c.k")).toBe(true);
    expect(containsProfanity("f\u200bu\u200bc\u200bk")).toBe(true);
    expect(containsProfanity("fuсk")).toBe(true); // Cyrillic с
    expect(containsProfanity("fùck")).toBe(true);
  });

  it("allows clean instructional feedback", () => {
    expect(
      containsProfanity("Strong work explaining the base case clearly."),
    ).toBe(false);
  });
});
