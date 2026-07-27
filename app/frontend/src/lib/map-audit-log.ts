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

  if (record.workflow_id != null) {
    uiDetails.workflowId = record.workflow_id;
  }

  for (const [key, value] of Object.entries(record.details ?? {})) {
    if (key in uiDetails) {
      continue; // Don't let a details field shadow the canonical columns above.
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
      uiDetails[key] = value;
    }
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

