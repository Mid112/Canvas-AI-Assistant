import type { UserRole } from "@/types/user";

/** Outcome of an audited action — stored in audit_logs.details.result (JSONB). */
export type AuditLogResult = "success" | "failed";

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
  workflow_id: number | null;
  action: string;
  details: Record<string, unknown> | null;
  timestamp: string;
  user_email: string;
  user_role: UserRole;
}

/** Proposed paginated admin list response for GET /api/v1/admin/audit/logs */
export interface FetchAuditLogsResponse {
  items: AuditLogApiRecord[];
  total: number;
  page: number;
  page_size: number;
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
    filters.date ||
      filters.user ||
      filters.action ||
      filters.result ||
      filters.search,
  );
}
