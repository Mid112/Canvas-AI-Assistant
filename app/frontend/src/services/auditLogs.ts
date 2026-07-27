import { formatAuditTimestamp } from "@/lib/format-audit-timestamp";
import { formatAuditLogUserRole, mapAuditLogApiToEntry } from "@/lib/map-audit-log";
import { apiRequest } from "@/lib/api-request";
import type {
  AuditLogApiRecord,
  AuditLogEntry,
  AuditLogResult,
  AuditLogSortDirection,
  AuditLogSortField,
  FetchAuditLogsResponse,
} from "@/types/auditLog";

export const AUDIT_LOGS_ADMIN_PATH = "/audit/logs";

/** Per-user route (MCP). Admin UI uses AUDIT_LOGS_ADMIN_PATH. */
export const AUDIT_LOGS_USER_PATH = "/audit/logs";

/** Rows fetched per network request; further pages are fetched via `offset` on demand. */
export const AUDIT_LOGS_BATCH_SIZE = 200;

export interface AuditLogsBatch {
  entries: AuditLogEntry[];
  /** Total matching rows on the server, across both audit_logs and audit_logs_session. */
  total: number;
}

export interface FetchAuditLogsParams {
  offset?: number;
  limit?: number;
  /** Free-text match across action, resource, and user email/role (both audit sources). */
  search?: string;
  action?: string;
  /** Free-text match against user email/role. */
  user?: string;
  result?: AuditLogResult;
  /** ISO 8601 instant, inclusive lower bound on timestamp. */
  startTime?: string;
  /** ISO 8601 instant, exclusive upper bound on timestamp. */
  endTime?: string;
  /** Server-side sort — a true global sort across the full table, not just
   * whatever rows happen to already be loaded client-side. */
  sortField?: AuditLogSortField;
  sortDirection?: AuditLogSortDirection;
}

/** Server-side search/filter/sort, so results are correct against the full
 * audit table rather than whatever page happened to already be loaded
 * client-side. */
export async function fetchAuditLogs(
  accessToken: string,
  {
    offset = 0,
    limit = AUDIT_LOGS_BATCH_SIZE,
    search,
    action,
    user,
    result,
    startTime,
    endTime,
    sortField,
    sortDirection,
  }: FetchAuditLogsParams = {},
): Promise<AuditLogsBatch> {
  const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (search) query.set("search", search);
  if (action) query.set("action", action);
  if (user) query.set("user", user);
  if (result) query.set("result", result);
  if (startTime) query.set("start_time", startTime);
  if (endTime) query.set("end_time", endTime);
  if (sortField) query.set("sort_field", sortField);
  if (sortDirection) query.set("sort_direction", sortDirection);

  const response = await apiRequest<FetchAuditLogsResponse | AuditLogApiRecord[]>(
    `${AUDIT_LOGS_ADMIN_PATH}?${query.toString()}`,
    accessToken,
  );

  const records = Array.isArray(response) ? response : response.items;
  const total = Array.isArray(response) ? records.length : response.total;
  return { entries: records.map(mapAuditLogApiToEntry), total };
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
