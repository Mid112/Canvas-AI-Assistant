import { describe, expect, it } from "vitest";

import { formatAuditTimestamp } from "@/lib/format-audit-timestamp";

describe("formatAuditTimestamp", () => {
  it("formats ISO timestamps as YYYY-MM-DD HH:MM:SS in local time", () => {
    const date = new Date("2026-05-31T14:23:45");
    const expected = [
      "2026-05-31",
      [
        String(date.getHours()).padStart(2, "0"),
        String(date.getMinutes()).padStart(2, "0"),
        String(date.getSeconds()).padStart(2, "0"),
      ].join(":"),
    ].join(" ");

    expect(formatAuditTimestamp("2026-05-31T14:23:45")).toBe(expected);
  });

  it("returns Unknown for invalid timestamps", () => {
    expect(formatAuditTimestamp("not-a-date")).toBe("Unknown");
  });
});
