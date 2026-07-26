import type { UserRole } from "@/types/user";

/** Outcome of an audited action — stored in audit_logs.details.result (JSONB). */
export type AuditLogResult = "success" | "failed" | "unknown";

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userEmail: string;
  /** Matches users.role in the backend: instructor | admin. */
  userRole: UserRole;
  action: string;
  /** Stored in audit_logs.details.resource (JSONB) until a dedicated column exists. */
  resource: string;
  /** Stored in audit_logs.details.result (JSONB) until a dedicated column exists. */
  result: AuditLogResult;
  /** Remaining JSONB keys shown when a table row is expanded. */
  details: Record<string, string | number | boolean | null>;
}

/**
 * Backend audit_logs row shape (+ joined user fields).
 * Aligns with app/backend/app/models/audit_log.py and db/init/01_schema.sql.
 */
export interface AuditLogApiRecord {
  id: number;
  user_id: number;
  /** Null for rows sourced from audit_logs_session (admin/security events). */
  workflow_id: number | null;
  course_id: number | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  operation: string;
  status: string;
  timestamp: string;
  user_email: string;
  user_role: UserRole;
  details?: Record<string, unknown> | null;
}

/** GET /api/v1/audit/logs and /api/v1/admin/audit/logs response shape. */
export interface FetchAuditLogsResponse {
  items: AuditLogApiRecord[];
  total: number;
}

export interface AuditLogFilters {
  user: string;
  action: string;
  result: "" | AuditLogResult;
  search: string;
}

export const emptyAuditLogFilters: AuditLogFilters = {
  user: "",
  action: "",
  result: "",
  search: "",
};

/**
 * How far back the Audit Logs page's range filter looks — sent to the
 * backend as `range_days` so audit_logs and audit_logs_session are both
 * filtered (and their totals both counted) server-side, rather than
 * filtering only whatever's already been fetched into the browser.
 * `null` means all time.
 */
export type AuditLogRangeDays = 7 | 30 | 90 | null;

export const defaultAuditLogRangeDays: AuditLogRangeDays = null;

export interface AuditLogRangeOption {
  value: AuditLogRangeDays;
  label: string;
}

export const AUDIT_LOG_RANGE_OPTIONS: AuditLogRangeOption[] = [
  { value: null, label: "All time" },
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 3 months" },
];

export type AuditLogSortField =
  | "timestamp"
  | "user"
  | "action"
  | "resource"
  | "result";

export type AuditLogSortDirection = "asc" | "desc";

export interface AuditLogSort {
  field: AuditLogSortField;
  direction: AuditLogSortDirection;
}

export const defaultAuditLogSort: AuditLogSort = {
  field: "timestamp",
  direction: "desc",
};

export const AUDIT_LOG_PAGE_SIZE = 10;

export function hasActiveAuditLogFilters(filters: AuditLogFilters): boolean {
  return Boolean(
    filters.user || filters.action || filters.result || filters.search,
  );
}
