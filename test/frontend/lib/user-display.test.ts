import { describe, expect, it } from "vitest";

import { getInitials } from "@/lib/user-display";

describe("getInitials", () => {
  it("returns initials from first and last name", () => {
    expect(getInitials("Dr. Jane Doe")).toBe("JD");
  });

  it("returns first two characters for a single name", () => {
    expect(getInitials("Alex")).toBe("AL");
  });

  it("returns a fallback for empty names", () => {
    expect(getInitials("   ")).toBe("?");
  });
});
