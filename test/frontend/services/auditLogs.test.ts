import { beforeEach, describe, expect, it, vi } from "vitest";

import { mockAuditLogs } from "@/data/mockAuditLogs";
import { mockAuditLogApiRecords } from "@/data/mockAuditLogs";
import {
  buildAuditLogsCsv,
  fetchAuditLogs,
  AUDIT_LOGS_ADMIN_PATH,
} from "@/services/auditLogs";

vi.mock("@/config/api", () => ({
  API_BASE_URL: "http://localhost:8000/api/v1",
}));

describe("auditLogs service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches and maps audit logs from the API", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: mockAuditLogApiRecords,
          total: mockAuditLogApiRecords.length,
        }),
        { status: 200 },
      ),
    );

    const logs = await fetchAuditLogs("access-token");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `http://localhost:8000/api/v1${AUDIT_LOGS_ADMIN_PATH}?limit=200&offset=0`,
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    expect(logs).toHaveLength(1);
    expect(logs[0]?.action).toBe("send_message");
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
});
