import { describe, expect, it } from "vitest";

import { formatRelativeTime } from "@/lib/format-relative-time";

describe("formatRelativeTime", () => {
  it('returns "Never" when the instructor has not logged in', () => {
    expect(formatRelativeTime(null)).toBe("Never");
  });
});
