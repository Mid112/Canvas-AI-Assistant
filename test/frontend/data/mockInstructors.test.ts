// Test note: covers the mock instructors.test behavior so future changes can preserve the expected Canvas workflow contract.

import { describe, expect, it } from "vitest";

import { mockInstructors, filterInstructors } from "@/data/mockInstructors";

describe("filterInstructors", () => {
  // Verifies: Filters instructors by name and email.
  it("filters instructors by name and email", () => {
    expect(filterInstructors(mockInstructors, "Robert")).toHaveLength(1);
    expect(filterInstructors(mockInstructors, "community.edu")).toHaveLength(1);
    expect(filterInstructors(mockInstructors, "")).toHaveLength(mockInstructors.length);
  });
});
