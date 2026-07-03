import { mockAuditLogs } from "@/data/mockAuditLogs";
import { formatAuditTimestamp } from "@/lib/format-audit-timestamp";
import { formatAuditLogUserRole } from "@/lib/map-audit-log";
import type { AuditLogEntry, AuditLogResult } from "@/types/auditLog";
import type { UserRole } from "@/types/user";

/**
 * Mock audit log service backed by localStorage until GET /admin/audit/logs is available.
 * Swap fetchAuditLogs() to call the API and map with mapAuditLogApiToEntry.
 */
export const AUDIT_LOGS_ADMIN_PATH = "/admin/audit/logs";

/** Per-user route (MCP). Admin UI uses AUDIT_LOGS_ADMIN_PATH. */
export const AUDIT_LOGS_USER_PATH = "/audit/logs";

const STORAGE_KEY = "canvas-workflow-admin-audit-logs";
const MOCK_DELAY_MS = 350;

function delay(ms: number = MOCK_DELAY_MS): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isUserRole(value: unknown): value is UserRole {
  return value === "instructor" || value === "admin";
}

function isAuditLogResult(value: unknown): value is AuditLogResult {
  return value === "success" || value === "failed";
}

function isStoredAuditLogEntry(value: unknown): value is AuditLogEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const log = value as AuditLogEntry;

  return (
    typeof log.id === "string" &&
    typeof log.timestamp === "string" &&
    typeof log.userEmail === "string" &&
    isUserRole(log.userRole) &&
    typeof log.action === "string" &&
    typeof log.resource === "string" &&
    isAuditLogResult(log.result) &&
    log.details !== null &&
    typeof log.details === "object"
  );
}

function readAuditLogs(): AuditLogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [...mockAuditLogs];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [...mockAuditLogs];
    }

    const valid = parsed.filter(isStoredAuditLogEntry);
    if (valid.length !== parsed.length) {
      localStorage.removeItem(STORAGE_KEY);
      return [...mockAuditLogs];
    }

    return valid;
  } catch {
    return [...mockAuditLogs];
  }
}

function getStoredAuditLogs(): AuditLogEntry[] {
  const logs = readAuditLogs();

  if (!localStorage.getItem(STORAGE_KEY)) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
  }

  return logs;
}

/** Resets audit logs to seed data — useful for tests. */
export function resetMockAuditLogs(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export async function fetchAuditLogs(): Promise<AuditLogEntry[]> {
  await delay();

  // API: GET `${API_BASE_URL}${AUDIT_LOGS_ADMIN_PATH}?${buildAuditLogQueryParams(...)}`
  // return response.items.map(mapAuditLogApiToEntry);

  return getStoredAuditLogs();
}

function escapeCsvField(value: string): string {
  let escaped = value;

  if (/^[=+\-@]/.test(escaped)) {
    escaped = `'${escaped}`;
  }

  if (/[",\n]/.test(escaped)) {
    return `"${escaped.replace(/"/g, '""')}"`;
  }

  return escaped;
}

export function buildAuditLogsCsv(logs: AuditLogEntry[]): string {
  const headers = [
    "Timestamp",
    "User Email",
    "User Role",
    "Action",
    "Resource",
    "Result",
  ];

  const rows = logs.map((log) => [
    formatAuditTimestamp(log.timestamp),
    log.userEmail,
    formatAuditLogUserRole(log.userRole),
    log.action,
    log.resource,
    log.result,
  ]);

  return [headers, ...rows]
    .map((row) => row.map((cell) => escapeCsvField(cell)).join(","))
    .join("\n");
}

/** Triggers a browser download of the provided audit log entries as CSV. */
export function downloadAuditLogsCsv(
  logs: AuditLogEntry[],
  filename = "audit-logs.csv",
): void {
  const csv = buildAuditLogsCsv(logs);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
