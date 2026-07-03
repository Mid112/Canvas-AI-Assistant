import { describe, expect, it } from "vitest";

import { mockAuditLogs } from "@/data/mockAuditLogs";
import {
  filterAuditLogs,
  paginateAuditLogs,
  sortAuditLogs,
} from "@/lib/audit-log-query";
import {
  defaultAuditLogSort,
  emptyAuditLogFilters,
  type AuditLogEntry,
} from "@/types/auditLog";

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

  it("filters by result", () => {
    const filtered = filterAuditLogs(mockAuditLogs, {
      ...emptyAuditLogFilters,
      result: "failed",
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.result).toBe("failed");
  });

  it("filters by date using local time (matching displayed date)", () => {
    const filtered = filterAuditLogs(mockAuditLogs, {
      ...emptyAuditLogFilters,
      date: "2026-05-31",
    });

    expect(filtered).toHaveLength(5);
  });

  it("matches date filter against local time, not UTC", () => {
    const lateUtcLog: AuditLogEntry = {
      ...mockAuditLogs[0]!,
      id: "audit-late-utc",
      timestamp: "2026-05-31T23:50:00.000Z",
    };

    const localDate = new Date("2026-05-31T23:50:00.000Z");
    const pad = (v: number) => String(v).padStart(2, "0");
    const expectedLocalDate = `${localDate.getFullYear()}-${pad(localDate.getMonth() + 1)}-${pad(localDate.getDate())}`;

    const filtered = filterAuditLogs([lateUtcLog], {
      ...emptyAuditLogFilters,
      date: expectedLocalDate,
    });

    expect(filtered).toHaveLength(1);
  });
});

describe("sortAuditLogs", () => {
  it("sorts timestamps newest first by default", () => {
    const sorted = sortAuditLogs(mockAuditLogs, defaultAuditLogSort);

    expect(sorted[0]?.id).toBe("audit-1");
    expect(sorted.at(-1)?.id).toBe("audit-5");
  });

  it("sorts users alphabetically", () => {
    const sorted = sortAuditLogs(mockAuditLogs, {
      field: "user",
      direction: "asc",
    });

    expect(sorted[0]?.userEmail).toBe("admin@system.local");
  });
});

describe("paginateAuditLogs", () => {
  const manyLogs = Array.from({ length: 25 }, (_, index) => ({
    ...mockAuditLogs[0]!,
    id: `audit-${index}`,
  })) as AuditLogEntry[];

  it("returns the first page of results", () => {
    const page = paginateAuditLogs(manyLogs, 1, 10);

    expect(page.items).toHaveLength(10);
    expect(page.page).toBe(1);
    expect(page.totalPages).toBe(3);
    expect(page.startIndex).toBe(1);
    expect(page.endIndex).toBe(10);
  });

  it("returns the final partial page", () => {
    const page = paginateAuditLogs(manyLogs, 3, 10);

    expect(page.items).toHaveLength(5);
    expect(page.startIndex).toBe(21);
    expect(page.endIndex).toBe(25);
  });
});
