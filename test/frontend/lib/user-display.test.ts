import { describe, expect, it } from "vitest";

import { getInitials } from "@/lib/user-display";

describe("getInitials", () => {
  it("uses the first and last meaningful name initials", () => {
    expect(getInitials("Dr. Jane Doe")).toBe("JD");
    expect(getInitials("Jane")).toBe("JA");
  });
});
