import type { UserRole } from "@/types/user";

/**
 * Rows sourced from audit_logs_session can be anonymous (failed login
 * against an email with no matching account — user_id is nullable, see
 * db/migrations/036_audit_log_session_nullable_user.sql), so the role is
 * unknown rather than absent.
 */
export type AuditLogUserRole = UserRole | "unknown";

/** Outcome of an audited action — stored in audit_logs.details.result (JSONB). */
export type AuditLogResult = "success" | "failed" | "unknown";

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userEmail: string;
  /** Matches users.role in the backend: instructor | admin | unknown (anonymous). */
  userRole: AuditLogUserRole;
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
  /** Null for anonymous failed-login attempts against unknown emails. */
  user_id: number | null;
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
  user_role: AuditLogUserRole;
  details?: Record<string, unknown> | null;
}

/** GET /api/v1/audit/logs and /api/v1/admin/audit/logs response shape. */
export interface FetchAuditLogsResponse {
  items: AuditLogApiRecord[];
  total: number;
}

export interface AuditLogFilters {
  date: string;
  user: string;
  action: string;
  result: "" | AuditLogResult;
  search: string;
}

export const emptyAuditLogFilters: AuditLogFilters = {
  date: "",
  user: "",
  action: "",
  result: "",
  search: "",
};

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
    filters.date || filters.user || filters.action || filters.result || filters.search,
  );
}
