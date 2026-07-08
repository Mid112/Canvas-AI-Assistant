import { describe, expect, it } from "vitest";

import { isValidEmail, isValidPassword, MIN_PASSWORD_LENGTH } from "@/lib/validation";

describe("isValidEmail", () => {
  // Verifies: Returns true for valid email addresses.
  it("returns true for valid email addresses", () => {
    expect(isValidEmail("professor@university.edu")).toBe(true);
    expect(isValidEmail("you@university.edu")).toBe(true);
  });

  // Verifies: Returns false for invalid email addresses.
  it("returns false for invalid email addresses", () => {
    expect(isValidEmail("invalid-email")).toBe(false);
    expect(isValidEmail("@university.edu")).toBe(false);
    expect(isValidEmail("user@")).toBe(false);
  });

  // Verifies: Trims whitespace before validating.
  it("trims whitespace before validating", () => {
    expect(isValidEmail("  professor@university.edu  ")).toBe(true);
  });

  // Verifies: Returns false for empty strings.
  it("returns false for empty strings", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("   ")).toBe(false);
  });
});

describe("isValidPassword", () => {
  it(`returns true for passwords with at least ${MIN_PASSWORD_LENGTH} characters`, () => {
    expect(isValidPassword("secret123")).toBe(true);
    expect(isValidPassword("a".repeat(MIN_PASSWORD_LENGTH))).toBe(true);
  });

  it(`returns false for passwords shorter than ${MIN_PASSWORD_LENGTH} characters`, () => {
    expect(isValidPassword("short")).toBe(false);
    expect(isValidPassword("")).toBe(false);
    expect(isValidPassword("a".repeat(MIN_PASSWORD_LENGTH - 1))).toBe(false);
  });
});
