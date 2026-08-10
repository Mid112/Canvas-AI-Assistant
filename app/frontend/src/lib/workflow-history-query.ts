import type {
  WorkflowHistoryEntry,
  WorkflowHistoryFilters,
} from "@/types/workflowHistory";

function matchesQuery(haystack: string, query: string): boolean {
  return haystack.toLowerCase().includes(query.trim().toLowerCase());
}

export function filterWorkflowHistory(
  entries: WorkflowHistoryEntry[],
  filters: WorkflowHistoryFilters,
): WorkflowHistoryEntry[] {
  return entries.filter((entry) => {
    if (filters.status && entry.status !== filters.status) {
      return false;
    }

    if (filters.search) {
      const haystack = [
        entry.actionName,
        entry.workflowName,
        entry.prompt,
        entry.userName,
        entry.affectedResourcesSummary,
      ].join(" ");

      if (!matchesQuery(haystack, filters.search)) {
        return false;
      }
    }

    return true;
  });
}

export function sortWorkflowHistoryByDate(
  entries: WorkflowHistoryEntry[],
): WorkflowHistoryEntry[] {
  return [...entries].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

export interface WorkflowHistoryPagination<T> {
  items: T[];
  page: number;
  totalPages: number;
  startIndex: number;
  endIndex: number;
}

export function paginateWorkflowHistory<T>(
  items: T[],
  page: number,
  pageSize: number,
): WorkflowHistoryPagination<T> {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    page: safePage,
    totalPages,
    startIndex: items.length === 0 ? 0 : start + 1,
    endIndex: Math.min(start + pageSize, items.length),
  };
}
