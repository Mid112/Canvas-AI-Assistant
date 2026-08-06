// Test note: covers the map audit log.test behavior so future changes can preserve the expected Canvas workflow contract.

import { describe, expect, it } from "vitest";

import { mockAuditLogApiRecords } from "@/data/mockAuditLogs";
import {
  formatAuditLogUserRole,
  mapAuditLogApiToEntry,
} from "@/lib/map-audit-log";

describe("mapAuditLogApiToEntry", () => {
  // Verifies: Maps backend audit_logs fields to the UI model.
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

  // Verifies: Defaults result to 'unknown' when status is unrecognized.
  it("defaults result to 'unknown' when status is unrecognized", () => {
    const record = {
      ...mockAuditLogApiRecords[0]!,
      status: "partial",
    };

    const entry = mapAuditLogApiToEntry(record);

    expect(entry.result).toBe("unknown");
  });

  // Verifies: Uses resource type alone when resource_id is missing.
  it("uses resource type alone when resource_id is missing", () => {
    const record = {
      ...mockAuditLogApiRecords[0]!,
      resource_id: null,
    };

    const entry = mapAuditLogApiToEntry(record);

    expect(entry.resource).toBe("announcement");
  });

  // Verifies: Omits workflowId for session-sourced rows with no workflow.
  it("omits workflowId when workflow_id is null", () => {
    const record = { ...mockAuditLogApiRecords[0]!, workflow_id: null };

    const entry = mapAuditLogApiToEntry(record);

    expect(entry.details.workflowId).toBeUndefined();
  });

  // Verifies: Spreads primitive details fields into the UI details map.
  it("spreads scalar details fields onto the entry", () => {
    const record = {
      ...mockAuditLogApiRecords[0]!,
      details: { instructor_id: 42, email: "i@example.com", changes: { name: "New Name" } },
    };

    const entry = mapAuditLogApiToEntry(record);

    expect(entry.details.instructor_id).toBe(42);
    expect(entry.details.email).toBe("i@example.com");
    expect(entry.details.changes).toBeUndefined();
  });

  // Verifies: A details field can't shadow the canonical operation/courseId/workflowId columns.
  it("does not let a details field shadow the canonical columns", () => {
    const record = {
      ...mockAuditLogApiRecords[0]!,
      details: { operation: "hijacked", workflowId: 999, courseId: 999 },
    };

    const entry = mapAuditLogApiToEntry(record);

    expect(entry.details.operation).toBe("create");
    expect(entry.details.workflowId).toBe(128);
    expect(entry.details.courseId).toBe(3);
  });
});

describe("formatAuditLogUserRole", () => {
  // Verifies: Maps backend roles to display labels.
  it("maps backend roles to display labels", () => {
    expect(formatAuditLogUserRole("instructor")).toBe("Instructor");
    expect(formatAuditLogUserRole("admin")).toBe("Administrator");
    expect(formatAuditLogUserRole("unknown")).toBe("Unknown");
  });
});
