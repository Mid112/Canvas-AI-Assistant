import type { UserRole } from "@/types/user";
import type {
  AuditLogApiRecord,
  AuditLogEntry,
  AuditLogFilters,
  AuditLogResult,
  AuditLogSort,
} from "@/types/auditLog";

const AUDIT_RESULTS = new Set<AuditLogResult>(["success", "failed"]);

function isDetailPrimitive(
  value: unknown,
): value is string | number | boolean | null {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  );
}

function readAuditLogResult(details: Record<string, unknown>): AuditLogResult {
  const value = details.result;
  return typeof value === "string" && AUDIT_RESULTS.has(value as AuditLogResult)
    ? (value as AuditLogResult)
    : "success";
}

/** Display label for roles stored as instructor | admin in the API/DB. */
export function formatAuditLogUserRole(role: UserRole): string {
  switch (role) {
    case "instructor":
      return "Instructor";
    case "admin":
      return "Administrator";
  }
}

/**
 * Maps a backend audit_logs row (+ joined user fields) to the UI model.
 *
 * Backend columns: id, user_id, workflow_id, action, details, timestamp
 * UI-only fields resource + result are read from details JSONB.
 */
export function mapAuditLogApiToEntry(record: AuditLogApiRecord): AuditLogEntry {
  const details = record.details ?? {};
  const resource =
    typeof details.resource === "string" ? details.resource : "—";
  const result = readAuditLogResult(details);

  const uiDetails: AuditLogEntry["details"] = {};

  for (const [key, value] of Object.entries(details)) {
    if (key === "resource" || key === "result") {
      continue;
    }

    if (isDetailPrimitive(value)) {
      uiDetails[key] = value;
    }
  }

  if (record.workflow_id != null) {
    uiDetails.workflowId = record.workflow_id;
  }

  return {
    id: String(record.id),
    timestamp: record.timestamp,
    userEmail: record.user_email,
    userRole: record.user_role,
    action: record.action,
    resource,
    result,
    details: uiDetails,
  };
}

export function auditLogUserSearchText(log: AuditLogEntry): string {
  return `${log.userEmail} ${formatAuditLogUserRole(log.userRole)} ${log.userRole}`;
}

export function auditLogSearchText(log: AuditLogEntry): string {
  return [
    log.timestamp,
    log.userEmail,
    formatAuditLogUserRole(log.userRole),
    log.userRole,
    log.action,
    log.resource,
    log.result,
  ].join(" ");
}

/** Query string for the proposed admin audit logs list endpoint. */
export function buildAuditLogQueryParams(
  filters: AuditLogFilters,
  sort: AuditLogSort,
  page: number,
  pageSize: number,
): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.date) {
    params.set("date", filters.date);
  }
  if (filters.user) {
    params.set("user", filters.user);
  }
  if (filters.action) {
    params.set("action", filters.action);
  }
  if (filters.result) {
    params.set("result", filters.result);
  }
  if (filters.search) {
    params.set("search", filters.search);
  }

  params.set("sort", `${sort.field}:${sort.direction}`);
  params.set("page", String(page));
  params.set("page_size", String(pageSize));

  return params;
}
