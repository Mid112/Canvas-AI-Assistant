import { beforeEach, describe, expect, it } from "vitest";

import { mockAuditLogs } from "@/data/mockAuditLogs";
import {
  buildAuditLogsCsv,
  fetchAuditLogs,
  resetMockAuditLogs,
} from "@/services/auditLogs";

describe("auditLogs service", () => {
  beforeEach(() => {
    resetMockAuditLogs();
  });

  it("returns seeded audit logs from the mock API", async () => {
    const logs = await fetchAuditLogs();
    expect(logs).toHaveLength(mockAuditLogs.length);
    expect(logs[0]?.action).toBe("Create Message Draft");
  });

  it("builds a CSV export with headers and rows", () => {
    const csv = buildAuditLogsCsv(mockAuditLogs.slice(0, 2));

    expect(csv).toContain("Timestamp,User Email,User Role,Action,Resource,Result");
    expect(csv).toContain("jane.doe@university.edu");
    expect(csv).toContain("Create Message Draft");
    expect(csv).toContain("alex.j@university.edu");
  });

  it("prefixes spreadsheet formula characters in exported values", () => {
    const csv = buildAuditLogsCsv([
      {
        ...mockAuditLogs[0]!,
        resource: "=SUM(A1:A10)",
      },
    ]);

    expect(csv).toContain("'=SUM(A1:A10)");
  });

  it("drops invalid entries and keeps valid ones from localStorage", async () => {
    localStorage.setItem(
      "canvas-workflow-admin-audit-logs",
      JSON.stringify([
        mockAuditLogs[0],
        {
          ...mockAuditLogs[1],
          userRole: "Teaching Assistant",
        },
      ]),
    );

    const logs = await fetchAuditLogs();

    expect(logs).toHaveLength(1);
    expect(logs[0]?.id).toBe(mockAuditLogs[0]!.id);
  });

  it("falls back to seed data when all localStorage entries are invalid", async () => {
    localStorage.setItem(
      "canvas-workflow-admin-audit-logs",
      JSON.stringify([
        {
          ...mockAuditLogs[0],
          userRole: "Teaching Assistant",
        },
      ]),
    );

    const logs = await fetchAuditLogs();

    expect(logs).toHaveLength(mockAuditLogs.length);
    expect(logs[0]?.userRole).toBe("instructor");
  });
});
