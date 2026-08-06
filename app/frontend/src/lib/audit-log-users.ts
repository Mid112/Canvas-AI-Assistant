// Frontend helper note: centralizes audit log users behavior so components and tests share one implementation.

import type { AuditLogEntry } from "@/types/auditLog";

/** Unique user emails from loaded audit logs, sorted alphabetically. */
export function getUniqueAuditLogUsers(logs: AuditLogEntry[]): string[] {
  return [...new Set(logs.map((log) => log.userEmail))].sort((a, b) =>
    a.localeCompare(b),
  );
}
