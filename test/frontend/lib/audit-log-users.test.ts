import { describe, expect, it } from "vitest";

import { mockAuditLogs } from "@/data/mockAuditLogs";
import { getUniqueAuditLogUsers } from "@/lib/audit-log-users";

describe("getUniqueAuditLogUsers", () => {
  it("returns sorted unique user emails from audit logs", () => {
    expect(getUniqueAuditLogUsers(mockAuditLogs)).toEqual([
      "admin@system.local",
      "alex.j@university.edu",
      "jane.doe@university.edu",
      "michael.c@university.edu",
      "r.wilson@university.edu",
    ]);
  });
});
