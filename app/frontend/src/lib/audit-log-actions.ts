import type { AuditLogEntry } from "@/types/auditLog";

/** Unique action labels from loaded audit logs, sorted alphabetically. */
export function getUniqueAuditLogActions(logs: AuditLogEntry[]): string[] {
  return [...new Set(logs.map((log) => log.action))].sort((a, b) =>
    a.localeCompare(b),
  );
}
