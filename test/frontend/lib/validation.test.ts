import { describe, expect, it } from "vitest";

import { isValidEmail } from "@/lib/validation";

describe("isValidEmail", () => {
  it("returns true for valid email addresses", () => {
    expect(isValidEmail("professor@university.edu")).toBe(true);
    expect(isValidEmail("you@university.edu")).toBe(true);
  });

  it("returns false for invalid email addresses", () => {
    expect(isValidEmail("invalid-email")).toBe(false);
    expect(isValidEmail("@university.edu")).toBe(false);
    expect(isValidEmail("user@")).toBe(false);
  });

  it("trims whitespace before validating", () => {
    expect(isValidEmail("  professor@university.edu  ")).toBe(true);
  });

  it("returns false for empty strings", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("   ")).toBe(false);
  });
});
