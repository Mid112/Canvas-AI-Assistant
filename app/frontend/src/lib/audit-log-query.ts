import type { FetchAuditLogsParams } from "@/services/auditLogs";
import type { AuditLogEntry, AuditLogFilters, AuditLogSort } from "@/types/auditLog";

/** Converts a local-time YYYY-MM-DD day (as picked in the date filter) into
 * the UTC instant range [start of that local day, start of the next local
 * day) -- so "date" filtering matches the calendar day the user actually
 * sees, not the UTC day the timestamp happens to fall on. */
function localDateToUtcRange(date: string): { startTime: string; endTime: string } {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  const end = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  return { startTime: start.toISOString(), endTime: end.toISOString() };
}

/** Maps the audit log filter bar's state onto the server's query params --
 * search now runs against the full audit table server-side rather than
 * whatever page happened to already be loaded client-side. */
export function auditLogFiltersToQueryParams(
  filters: AuditLogFilters,
): Omit<FetchAuditLogsParams, "offset" | "limit"> {
  const params: Omit<FetchAuditLogsParams, "offset" | "limit"> = {};

  if (filters.search) params.search = filters.search;
  if (filters.action) params.action = filters.action;
  if (filters.user) params.user = filters.user;
  if (filters.result) params.result = filters.result;
  if (filters.date) {
    const { startTime, endTime } = localDateToUtcRange(filters.date);
    params.startTime = startTime;
    params.endTime = endTime;
  }

  return params;
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
