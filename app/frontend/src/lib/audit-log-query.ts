import { formatAuditTimestamp } from "@/lib/format-audit-timestamp";
import {
  auditLogSearchText,
  auditLogUserSearchText,
} from "@/lib/map-audit-log";
import type {
  AuditLogEntry,
  AuditLogFilters,
  AuditLogSort,
} from "@/types/auditLog";

function matchesQuery(haystack: string, query: string): boolean {
  return haystack.toLowerCase().includes(query.trim().toLowerCase());
}

/**
 * Client-side filter for user/action/result/search — the date-range
 * dimension is applied server-side (range_days, see services/auditLogs.ts)
 * since it's the dimension most likely to blow past what's been fetched;
 * these remaining filters run over whatever's loaded, backed by
 * AuditLogsPage's loadAllRemaining so a filter is never applied to a
 * partial set.
 */
export function filterAuditLogs(
  logs: AuditLogEntry[],
  filters: AuditLogFilters,
): AuditLogEntry[] {
  return logs.filter((log) => {
    if (filters.user && !matchesQuery(auditLogUserSearchText(log), filters.user)) {
      return false;
    }

    if (filters.action && !matchesQuery(log.action, filters.action)) {
      return false;
    }

    if (filters.result && log.result !== filters.result) {
      return false;
    }

    if (filters.search) {
      const haystack = [
        formatAuditTimestamp(log.timestamp),
        auditLogSearchText(log),
      ].join(" ");

      if (!matchesQuery(haystack, filters.search)) {
        return false;
      }
    }

    return true;
  });
}

export function sortAuditLogs(
  logs: AuditLogEntry[],
  sort: AuditLogSort,
): AuditLogEntry[] {
  const direction = sort.direction === "asc" ? 1 : -1;

  return [...logs].sort((left, right) => {
    let comparison = 0;

    switch (sort.field) {
      case "timestamp":
        comparison = left.timestamp.localeCompare(right.timestamp);
        break;
      case "user":
        comparison =
          left.userEmail.localeCompare(right.userEmail) ||
          left.userRole.localeCompare(right.userRole);
        break;
      case "action":
        comparison = left.action.localeCompare(right.action);
        break;
      case "resource":
        comparison = left.resource.localeCompare(right.resource);
        break;
      case "result":
        comparison = left.result.localeCompare(right.result);
        break;
    }

    return comparison * direction;
  });
}

export interface AuditLogPaginationResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
  startIndex: number;
  endIndex: number;
}

export function paginateAuditLogs<T>(
  items: T[],
  page: number,
  pageSize: number,
): AuditLogPaginationResult<T> {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    page: safePage,
    pageSize,
    totalPages,
    totalItems,
    startIndex: totalItems === 0 ? 0 : start + 1,
    endIndex: Math.min(start + pageSize, totalItems),
  };
}
