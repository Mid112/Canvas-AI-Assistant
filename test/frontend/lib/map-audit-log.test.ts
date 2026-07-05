import { describe, expect, it } from "vitest";

import { mockAuditLogApiRecords } from "@/data/mockAuditLogs";
import {
  formatAuditLogUserRole,
  mapAuditLogApiToEntry,
} from "@/lib/map-audit-log";

describe("mapAuditLogApiToEntry", () => {
  it("maps backend audit_logs fields to the UI model", () => {
    const entry = mapAuditLogApiToEntry(mockAuditLogApiRecords[0]!);

    expect(entry).toMatchObject({
      id: "1",
      userEmail: "jane.doe@university.edu",
      userRole: "instructor",
      action: "send_message",
      resource: "announcement #4521",
      result: "success",
    });
    expect(entry.details.workflowId).toBe(128);
    expect(entry.details.courseId).toBe(3);
    expect(entry.details.operation).toBe("create");
  });

  it("defaults result to 'unknown' when status is unrecognized", () => {
    const record = {
      ...mockAuditLogApiRecords[0]!,
      status: "partial",
    };

    const entry = mapAuditLogApiToEntry(record);

    expect(entry.result).toBe("unknown");
  });

  it("uses resource type alone when resource_id is missing", () => {
    const record = {
      ...mockAuditLogApiRecords[0]!,
      resource_id: null,
    };

    const entry = mapAuditLogApiToEntry(record);

    expect(entry.resource).toBe("announcement");
  });
});

describe("formatAuditLogUserRole", () => {
  it("maps backend roles to display labels", () => {
    expect(formatAuditLogUserRole("instructor")).toBe("Instructor");
    expect(formatAuditLogUserRole("admin")).toBe("Administrator");
  });
});
