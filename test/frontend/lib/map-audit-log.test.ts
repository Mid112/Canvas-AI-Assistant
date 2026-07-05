import { describe, expect, it } from "vitest";

import { mockAuditLogApiRecords } from "@/data/mockAuditLogs";
import {
  formatAuditLogUserRole,
  mapAuditLogApiToEntry,
} from "@/lib/map-audit-log";

describe("mapAuditLogApiToEntry", () => {
  it("maps backend audit_logs fields and JSONB details to the UI model", () => {
    const entry = mapAuditLogApiToEntry(mockAuditLogApiRecords[0]!);

    expect(entry).toMatchObject({
      id: "1",
      userEmail: "jane.doe@university.edu",
      userRole: "instructor",
      action: "Create Message Draft",
      resource: "Message Draft #4521",
      result: "success",
    });
    expect(entry.details.workflowId).toBe(128);
    expect(entry.details.resource).toBeUndefined();
    expect(entry.details.result).toBeUndefined();
  });

  it("defaults result to 'unknown' when details.result is missing", () => {
    const record = {
      ...mockAuditLogApiRecords[0]!,
      details: { resource: "Test Resource" },
    };

    const entry = mapAuditLogApiToEntry(record);

    expect(entry.result).toBe("unknown");
  });

  it("defaults result to 'unknown' when details.result is unrecognized", () => {
    const record = {
      ...mockAuditLogApiRecords[0]!,
      details: { resource: "Test Resource", result: "partial" },
    };

    const entry = mapAuditLogApiToEntry(record);

    expect(entry.result).toBe("unknown");
  });
});

describe("formatAuditLogUserRole", () => {
  it("maps backend roles to display labels", () => {
    expect(formatAuditLogUserRole("instructor")).toBe("Instructor");
    expect(formatAuditLogUserRole("admin")).toBe("Administrator");
  });
});

