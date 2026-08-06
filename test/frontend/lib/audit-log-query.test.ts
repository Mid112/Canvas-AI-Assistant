// Test note: covers the audit log query.test behavior so future changes can preserve the expected Canvas workflow contract.

import { describe, expect, it } from "vitest";

import { mockAuditLogs } from "@/data/mockAuditLogs";
import {
  auditLogFiltersToQueryParams,
  paginateAuditLogs,
  sortAuditLogs,
} from "@/lib/audit-log-query";
import {
  defaultAuditLogSort,
  emptyAuditLogFilters,
  type AuditLogEntry,
} from "@/types/auditLog";

describe("auditLogFiltersToQueryParams", () => {
  // Verifies: Returns no params when filters are empty.
  it("returns no params when filters are empty", () => {
    expect(auditLogFiltersToQueryParams(emptyAuditLogFilters)).toEqual({});
  });

  // Verifies: Passes search/action/user/result straight through.
  it("passes search/action/user/result straight through", () => {
    const params = auditLogFiltersToQueryParams({
      ...emptyAuditLogFilters,
      search: "bearer sk-",
      action: "Delete",
      user: "Instructor",
      result: "failed",
    });

    expect(params).toMatchObject({
      search: "bearer sk-",
      action: "Delete",
      user: "Instructor",
      result: "failed",
    });
  });

  // Verifies: Converts a local-time date into a UTC [start, end) range.
  it("converts a local-time date into a UTC start/end range", () => {
    const params = auditLogFiltersToQueryParams({
      ...emptyAuditLogFilters,
      date: "2026-05-31",
    });

    expect(params.startTime).toBe(new Date(2026, 4, 31, 0, 0, 0, 0).toISOString());
    expect(params.endTime).toBe(new Date(2026, 5, 1, 0, 0, 0, 0).toISOString());
  });

  // Verifies: The converted range spans exactly one local calendar day.
  it("spans exactly one local calendar day regardless of timezone", () => {
    const params = auditLogFiltersToQueryParams({
      ...emptyAuditLogFilters,
      date: "2026-05-31",
    });

    const spanMs = new Date(params.endTime!).getTime() - new Date(params.startTime!).getTime();
    expect(spanMs).toBe(24 * 60 * 60 * 1000);
  });
});

describe("sortAuditLogs", () => {
  // Verifies: Sorts timestamps newest first by default.
  it("sorts timestamps newest first by default", () => {
    const sorted = sortAuditLogs(mockAuditLogs, defaultAuditLogSort);

    expect(sorted[0]?.id).toBe("audit-1");
    expect(sorted.at(-1)?.id).toBe("audit-5");
  });

  // Verifies: Sorts users alphabetically.
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

  // Verifies: Returns the first page of results.
  it("returns the first page of results", () => {
    const page = paginateAuditLogs(manyLogs, 1, 10);

    expect(page.items).toHaveLength(10);
    expect(page.page).toBe(1);
    expect(page.totalPages).toBe(3);
    expect(page.startIndex).toBe(1);
    expect(page.endIndex).toBe(10);
  });

  // Verifies: Returns the final partial page.
  it("returns the final partial page", () => {
    const page = paginateAuditLogs(manyLogs, 3, 10);

    expect(page.items).toHaveLength(5);
    expect(page.startIndex).toBe(21);
    expect(page.endIndex).toBe(25);
  });
});
