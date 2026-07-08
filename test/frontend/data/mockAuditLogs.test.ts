import { beforeEach, describe, expect, it } from "vitest";

import { filterAuditLogs, mockAuditLogs } from "@/data/mockAuditLogs";
import { emptyAuditLogFilters } from "@/types/auditLog";

describe("filterAuditLogs", () => {
  // Verifies: Returns all logs when filters are empty.
  it("returns all logs when filters are empty", () => {
    expect(filterAuditLogs(mockAuditLogs, emptyAuditLogFilters)).toHaveLength(5);
  });

  // Verifies: Filters by user email or role.
  it("filters by user email or role", () => {
    const filtered = filterAuditLogs(mockAuditLogs, {
      ...emptyAuditLogFilters,
      user: "Instructor",
    });

    expect(filtered).toHaveLength(4);
    expect(filtered.every((log) => log.userRole === "instructor")).toBe(true);
  });

  // Verifies: Filters by action name.
  it("filters by action name", () => {
    const filtered = filterAuditLogs(mockAuditLogs, {
      ...emptyAuditLogFilters,
      action: "Delete",
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.action).toBe("Delete Assignment");
  });

  // Verifies: Filters by date.
  it("filters by date", () => {
    const filtered = filterAuditLogs(mockAuditLogs, {
      ...emptyAuditLogFilters,
      date: "2026-05-31",
    });

    expect(filtered).toHaveLength(5);
  });

  // Verifies: Filters by free-text search across columns.
  it("filters by free-text search across columns", () => {
    const filtered = filterAuditLogs(mockAuditLogs, {
      ...emptyAuditLogFilters,
      search: "Quiz 5",
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.result).toBe("failed");
  });
});
