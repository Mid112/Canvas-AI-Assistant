// Test note: covers the user display.test behavior so future changes can preserve the expected Canvas workflow contract.

import { describe, expect, it } from "vitest";

import { getInitials } from "@/lib/user-display";

describe("getInitials", () => {
  // Verifies: Returns initials from first and last name.
  it("returns initials from first and last name", () => {
    expect(getInitials("Dr. Jane Doe")).toBe("JD");
  });

  // Verifies: Returns first two characters for a single name.
  it("returns first two characters for a single name", () => {
    expect(getInitials("Alex")).toBe("AL");
  });

  // Verifies: Returns a fallback for empty names.
  it("returns a fallback for empty names", () => {
    expect(getInitials("   ")).toBe("?");
  });
});
