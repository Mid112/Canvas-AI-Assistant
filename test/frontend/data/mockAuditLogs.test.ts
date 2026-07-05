import { beforeEach, describe, expect, it } from "vitest";

import { filterAuditLogs, mockAuditLogs } from "@/data/mockAuditLogs";
import { emptyAuditLogFilters } from "@/types/auditLog";

describe("filterAuditLogs", () => {
  it("returns all logs when filters are empty", () => {
    expect(filterAuditLogs(mockAuditLogs, emptyAuditLogFilters)).toHaveLength(5);
  });

  it("filters by user email or role", () => {
    const filtered = filterAuditLogs(mockAuditLogs, {
      ...emptyAuditLogFilters,
      user: "Instructor",
    });

    expect(filtered).toHaveLength(4);
    expect(filtered.every((log) => log.userRole === "instructor")).toBe(true);
  });

  it("filters by action name", () => {
    const filtered = filterAuditLogs(mockAuditLogs, {
      ...emptyAuditLogFilters,
      action: "Delete",
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.action).toBe("Delete Assignment");
  });

  it("filters by date", () => {
    const filtered = filterAuditLogs(mockAuditLogs, {
      ...emptyAuditLogFilters,
      date: "2026-05-31",
    });

    expect(filtered).toHaveLength(5);
  });

  it("filters by free-text search across columns", () => {
    const filtered = filterAuditLogs(mockAuditLogs, {
      ...emptyAuditLogFilters,
      search: "Quiz 5",
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.result).toBe("failed");
  });
});
