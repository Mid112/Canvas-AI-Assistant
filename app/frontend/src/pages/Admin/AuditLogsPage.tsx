import { Download } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AuditLogFiltersBar } from "@/components/admin/AuditLogFilters";
import { AuditLogTable } from "@/components/admin/AuditLogTable";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { getUniqueAuditLogActions } from "@/lib/audit-log-actions";
import {
  auditLogFiltersToQueryParams,
  paginateAuditLogs,
  sortAuditLogs,
} from "@/lib/audit-log-query";
import { getUniqueAuditLogUsers } from "@/lib/audit-log-users";
import {
  downloadAuditLogsCsv,
  fetchAuditLogs,
} from "@/services/auditLogs";
import {
  AUDIT_LOG_PAGE_SIZE,
  defaultAuditLogSort,
  emptyAuditLogFilters,
  type AuditLogEntry,
  type AuditLogFilters,
  type AuditLogSort,
} from "@/types/auditLog";
import { pageShellXWide } from "@/lib/page-shell";

// Debounces every filter keystroke (search/user/action are all free-typed,
// firing onChange per character) into a single server request instead of
// one per keystroke.
const FILTER_DEBOUNCE_MS = 300;

// Seeds the filter bar's suggestion dropdowns from a modest, unfiltered
// recent sample -- independent of the main (filtered, paginated) fetch, so
// the suggestion pool doesn't shrink to just the current page's rows.
const OPTIONS_SAMPLE_SIZE = 200;

export function AuditLogsPage() {
  const { accessToken } = useAuth();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [optionsSample, setOptionsSample] = useState<AuditLogEntry[]>([]);
  const [filters, setFilters] = useState<AuditLogFilters>(emptyAuditLogFilters);
  const [sort, setSort] = useState<AuditLogSort>(defaultAuditLogSort);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadRequestId = useRef(0);

  const userOptions = useMemo(() => getUniqueAuditLogUsers(optionsSample), [optionsSample]);
  const actionOptions = useMemo(() => getUniqueAuditLogActions(optionsSample), [optionsSample]);

  const sortedLogs = useMemo(() => sortAuditLogs(logs, sort), [logs, sort]);

  const pagination = useMemo(
    () => paginateAuditLogs(sortedLogs, page, AUDIT_LOG_PAGE_SIZE),
    [sortedLogs, page],
  );

  const handleFiltersChange = useCallback((next: AuditLogFilters) => {
    setFilters(next);
    setPage(1);
  }, []);

  const handleSortChange = useCallback((next: AuditLogSort) => {
    setSort(next);
    setPage(1);
  }, []);

  // The actual search/filter query -- runs server-side against the full
  // audit table (see services/audit.py::list_audit_logs), not just
  // whatever page happened to already be loaded here.
  const loadLogs = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    const requestId = loadRequestId.current + 1;
    loadRequestId.current = requestId;
    setIsLoading(true);
    setLoadError(null);

    try {
      const batch = await fetchAuditLogs(accessToken, auditLogFiltersToQueryParams(filters));
      if (loadRequestId.current === requestId) {
        setLogs(batch.entries);
        setTotal(batch.total);
      }
    } catch {
      if (loadRequestId.current === requestId) {
        setLoadError("Unable to load audit logs. Please try again.");
        setLogs([]);
        setTotal(0);
      }
    } finally {
      if (loadRequestId.current === requestId) {
        setIsLoading(false);
      }
    }
  }, [accessToken, filters]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadLogs();
    }, FILTER_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [loadLogs]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }
    void fetchAuditLogs(accessToken, { limit: OPTIONS_SAMPLE_SIZE })
      .then((batch) => setOptionsSample(batch.entries))
      .catch(() => {
        // Suggestion dropdowns are a convenience, not core functionality --
        // free-typed filter values still work even with no options loaded.
      });
  }, [accessToken]);

  const handleLoadMore = useCallback(async () => {
    if (!accessToken || isLoadingMore) {
      return;
    }

    setIsLoadingMore(true);
    try {
      const batch = await fetchAuditLogs(accessToken, {
        ...auditLogFiltersToQueryParams(filters),
        offset: logs.length,
      });
      setLogs((current) => [...current, ...batch.entries]);
      setTotal(batch.total);
    } catch {
      setLoadError("Unable to load more audit logs. Please try again.");
    } finally {
      setIsLoadingMore(false);
    }
  }, [accessToken, isLoadingMore, logs.length, filters]);

  const signedOutError = accessToken
    ? null
    : "You must be signed in to view audit logs.";
  const effectiveLoading = accessToken ? isLoading : false;
  const effectiveError = signedOutError ?? loadError;
  const hasMore = logs.length < total;

  const handleExport = () => {
    downloadAuditLogsCsv(sortedLogs);
  };

  return (
    <div className={pageShellXWide}>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Audit Logs
          </h1>
          <p className="text-sm text-muted-foreground">
            Review security and compliance events across the platform.
          </p>
        </div>
        <Button
          type="button"
          onClick={handleExport}
          disabled={effectiveLoading || sortedLogs.length === 0}
        >
          <Download className="size-4" aria-hidden="true" />
          Export
        </Button>
      </header>

      <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm ring-1 ring-border/60">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex w-fit items-center rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary">
            {hasMore ? `Audit logs (${logs.length} of ${total})` : `Audit logs (${logs.length})`}
          </div>
          {hasMore ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleLoadMore()}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? "Loading more..." : "Load more"}
            </Button>
          ) : null}
        </div>
        <AuditLogFiltersBar
          filters={filters}
          userOptions={userOptions}
          actionOptions={actionOptions}
          onChange={handleFiltersChange}
        />
      </div>

      <AuditLogTable
        logs={pagination.items}
        matchingCount={sortedLogs.length}
        totalCount={sortedLogs.length}
        startIndex={pagination.startIndex}
        endIndex={pagination.endIndex}
        page={pagination.page}
        totalPages={pagination.totalPages}
        sort={sort}
        filters={filters}
        onSortChange={handleSortChange}
        onFiltersChange={handleFiltersChange}
        onPageChange={setPage}
        onRetry={loadLogs}
        isLoading={effectiveLoading}
        errorMessage={effectiveError}
      />
    </div>
  );
}
