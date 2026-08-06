// Test note: covers the validation.test behavior so future changes can preserve the expected Canvas workflow contract.

import { describe, expect, it } from "vitest";

import {
  getPasswordRequirements,
  isValidEmail,
  isValidPassword,
  MIN_PASSWORD_LENGTH,
} from "@/lib/validation";

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
  it("returns true when length, case, number, and symbol rules are met", () => {
    expect(isValidPassword("Secret123!")).toBe(true);
  });

  it("returns false when any strength rule is missing", () => {
    expect(isValidPassword("short")).toBe(false);
    expect(isValidPassword("")).toBe(false);
    expect(isValidPassword("a".repeat(MIN_PASSWORD_LENGTH))).toBe(false);
    expect(isValidPassword("secret123")).toBe(false); // no uppercase / symbol
    expect(isValidPassword("SECRET123!")).toBe(false); // no lowercase
    expect(isValidPassword("Secret!!!")).toBe(false); // no number
    expect(isValidPassword("Secret123")).toBe(false); // no symbol
    expect(isValidPassword("Password1 ")).toBe(false); // whitespace is not a symbol
  });
});

describe("getPasswordRequirements", () => {
  it("checks off each requirement independently as the password grows", () => {
    expect(
      getPasswordRequirements("Abcdef1!").map((item) => [item.id, item.met]),
    ).toEqual([
      ["length", true],
      ["uppercase", true],
      ["lowercase", true],
      ["number", true],
      ["symbol", true],
    ]);

    const partial = getPasswordRequirements("Abcdefg");
    expect(partial.find((item) => item.id === "length")?.met).toBe(false);
    expect(partial.find((item) => item.id === "uppercase")?.met).toBe(true);
    expect(partial.find((item) => item.id === "lowercase")?.met).toBe(true);
    expect(partial.find((item) => item.id === "number")?.met).toBe(false);
    expect(partial.find((item) => item.id === "symbol")?.met).toBe(false);
  });
});
