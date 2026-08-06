import { describe, expect, it } from "vitest";

import { getUniqueAuditLogActions } from "@/lib/audit-log-actions";
import { mockAuditLogs } from "@/data/mockAuditLogs";

describe("getUniqueAuditLogActions", () => {
  // Verifies: Returns sorted unique action labels from audit logs.
  it("returns sorted unique action labels from audit logs", () => {
    expect(getUniqueAuditLogActions(mockAuditLogs)).toEqual([
      "Create Message Draft",
      "Delete Assignment",
      "Export Report",
      "Update User Role",
      "View Student Data",
    ]);
  });
});
