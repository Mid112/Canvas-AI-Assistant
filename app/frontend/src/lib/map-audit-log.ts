import type { UserRole } from "@/types/user";
import type {
  AuditLogApiRecord,
  AuditLogEntry,
  AuditLogResult,
} from "@/types/auditLog";

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
 */
export function mapAuditLogApiToEntry(record: AuditLogApiRecord): AuditLogEntry {
  const resource = record.resource_id
    ? `${record.resource_type} #${record.resource_id}`
    : record.resource_type;

  const result: AuditLogResult =
    record.status === "success" || record.status === "failed"
      ? record.status
      : "unknown";

  const uiDetails: AuditLogEntry["details"] = {
    operation: record.operation,
  };

  if (record.course_id != null) {
    uiDetails.courseId = record.course_id;
  }

  uiDetails.workflowId = record.workflow_id;

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

