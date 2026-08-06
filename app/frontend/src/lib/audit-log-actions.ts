// Frontend helper note: centralizes audit log actions behavior so components and tests share one implementation.

import type { AuditLogEntry } from "@/types/auditLog";

/** Unique action labels from loaded audit logs, sorted alphabetically. */
export function getUniqueAuditLogActions(logs: AuditLogEntry[]): string[] {
  return [...new Set(logs.map((log) => log.action))].sort((a, b) =>
    a.localeCompare(b),
  );
}
