import { describe, expect, it } from "vitest";

import { mockAuditLogApiRecords } from "@/data/mockAuditLogs";
import {
  buildAuditLogQueryParams,
  formatAuditLogUserRole,
  mapAuditLogApiToEntry,
} from "@/lib/map-audit-log";
import {
  defaultAuditLogSort,
  emptyAuditLogFilters,
} from "@/types/auditLog";

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
});

describe("formatAuditLogUserRole", () => {
  it("maps backend roles to display labels", () => {
    expect(formatAuditLogUserRole("instructor")).toBe("Instructor");
    expect(formatAuditLogUserRole("admin")).toBe("Administrator");
  });
});

describe("buildAuditLogQueryParams", () => {
  it("serializes filters, sort, and pagination for the proposed admin endpoint", () => {
    const params = buildAuditLogQueryParams(
      {
        ...emptyAuditLogFilters,
        date: "2026-05-31",
        user: "jane",
        action: "Create",
        result: "success",
        search: "draft",
      },
      defaultAuditLogSort,
      2,
      10,
    );

    expect(params.get("date")).toBe("2026-05-31");
    expect(params.get("user")).toBe("jane");
    expect(params.get("action")).toBe("Create");
    expect(params.get("result")).toBe("success");
    expect(params.get("search")).toBe("draft");
    expect(params.get("sort")).toBe("timestamp:desc");
    expect(params.get("page")).toBe("2");
    expect(params.get("page_size")).toBe("10");
  });
});
