import { formatAuditTimestamp } from "@/lib/format-audit-timestamp";
import { formatAuditLogUserRole, mapAuditLogApiToEntry } from "@/lib/map-audit-log";
import { apiRequest } from "@/lib/api-request";
import type {
  AuditLogEntry,
  AuditLogResult,
  FetchAuditLogsResponse,
} from "@/types/auditLog";

export const AUDIT_LOGS_ADMIN_PATH = "/audit/logs";

/** Per-user route (MCP). Admin UI uses AUDIT_LOGS_ADMIN_PATH. */
export const AUDIT_LOGS_USER_PATH = "/audit/logs";

export async function fetchAuditLogs(
  accessToken: string,
): Promise<AuditLogEntry[]> {
  const response = await apiRequest<FetchAuditLogsResponse>(
    `${AUDIT_LOGS_ADMIN_PATH}?limit=200&offset=0`,
    accessToken,
  );

  return response.items.map(mapAuditLogApiToEntry);
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

export type { AuditLogResult };
