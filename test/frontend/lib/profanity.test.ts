import { describe, expect, it } from "vitest";

import { containsProfanity } from "@/lib/profanity";

describe("containsProfanity", () => {
  it("detects blocked terms case-insensitively", () => {
    expect(containsProfanity("This is fucking inappropriate")).toBe(true);
    expect(containsProfanity("SHIT happens")).toBe(true);
  });

  it("allows clean instructional feedback", () => {
    expect(
      containsProfanity("Strong work explaining the base case clearly."),
    ).toBe(false);
  });
});
