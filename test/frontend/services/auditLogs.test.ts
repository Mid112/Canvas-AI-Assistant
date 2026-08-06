// Test note: covers the audit logs.test behavior so future changes can preserve the expected Canvas workflow contract.

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

  // Verifies: Fetches and maps audit logs from the API.
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

    const batch = await fetchAuditLogs("access-token");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `http://localhost:8000/api/v1${AUDIT_LOGS_ADMIN_PATH}?limit=200&offset=0`,
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    expect(batch.entries).toHaveLength(1);
    expect(batch.entries[0]?.action).toBe("send_message");
    expect(batch.total).toBe(1);
  });

  // Verifies: Requests a specific offset/limit window when paging further.
  it("requests a specific offset/limit window when paging further", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [], total: 250 }), { status: 200 }),
    );

    const batch = await fetchAuditLogs("access-token", { offset: 200, limit: 50 });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `http://localhost:8000/api/v1${AUDIT_LOGS_ADMIN_PATH}?limit=50&offset=200`,
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    expect(batch.entries).toHaveLength(0);
    expect(batch.total).toBe(250);
  });

  // Verifies: Forwards search/filter params as query string params.
  it("forwards search/filter params to the server", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 }),
    );

    await fetchAuditLogs("access-token", {
      search: "bearer sk-",
      action: "delete",
      user: "jane",
      result: "failed",
      startTime: "2026-05-31T00:00:00.000Z",
      endTime: "2026-06-01T00:00:00.000Z",
    });

    const calledUrl = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0]?.[0] as string;
    const query = new URL(calledUrl).searchParams;
    expect(query.get("search")).toBe("bearer sk-");
    expect(query.get("action")).toBe("delete");
    expect(query.get("user")).toBe("jane");
    expect(query.get("result")).toBe("failed");
    expect(query.get("start_time")).toBe("2026-05-31T00:00:00.000Z");
    expect(query.get("end_time")).toBe("2026-06-01T00:00:00.000Z");
  });

  // Verifies: Omits empty filter params rather than sending blank values.
  it("omits filter params that are not provided", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 }),
    );

    await fetchAuditLogs("access-token");

    const calledUrl = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0]?.[0] as string;
    const query = new URL(calledUrl).searchParams;
    expect(query.has("search")).toBe(false);
    expect(query.has("action")).toBe(false);
    expect(query.has("user")).toBe(false);
    expect(query.has("result")).toBe(false);
    expect(query.has("start_time")).toBe(false);
    expect(query.has("end_time")).toBe(false);
  });

  // Verifies: Builds a CSV export with headers and rows.
  it("builds a CSV export with headers and rows", () => {
    const csv = buildAuditLogsCsv(mockAuditLogs.slice(0, 2));

    expect(csv).toContain("Timestamp,User Email,User Role,Action,Resource,Result");
    expect(csv).toContain("jane.doe@university.edu");
    expect(csv).toContain("Create Message Draft");
    expect(csv).toContain("alex.j@university.edu");
  });

  // Verifies: Prefixes spreadsheet formula characters in exported values.
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
