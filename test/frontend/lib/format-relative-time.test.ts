// Test note: covers the format relative time.test behavior so future changes can preserve the expected Canvas workflow contract.

import { describe, expect, it } from "vitest";

import { formatRelativeTime } from "@/lib/format-relative-time";

describe("formatRelativeTime", () => {
  it('returns "Never" when the instructor has not logged in', () => {
    expect(formatRelativeTime(null)).toBe("Never");
  });
});
