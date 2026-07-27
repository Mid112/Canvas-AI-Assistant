import { Download } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AuditLogFiltersBar } from "@/components/admin/AuditLogFilters";
import { AuditLogTable } from "@/components/admin/AuditLogTable";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { getUniqueAuditLogActions } from "@/lib/audit-log-actions";
import {
  filterAuditLogs,
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
  defaultAuditLogRangeDays,
  defaultAuditLogSort,
  emptyAuditLogFilters,
  hasActiveAuditLogFilters,
  type AuditLogEntry,
  type AuditLogFilters,
  type AuditLogRangeDays,
  type AuditLogSort,
} from "@/types/auditLog";
import { pageShellXWide } from "@/lib/page-shell";

export function AuditLogsPage() {
  const { accessToken } = useAuth();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<AuditLogFilters>(emptyAuditLogFilters);
  const [rangeDays, setRangeDays] = useState<AuditLogRangeDays>(defaultAuditLogRangeDays);
  const [loadedRangeDays, setLoadedRangeDays] = useState<AuditLogRangeDays>(defaultAuditLogRangeDays);
  const [sort, setSort] = useState<AuditLogSort>(defaultAuditLogSort);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isLoadingAll, setIsLoadingAll] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadRequestId = useRef(0);
  const loadingAllRef = useRef(false);

  const userOptions = useMemo(() => getUniqueAuditLogUsers(logs), [logs]);
  const actionOptions = useMemo(() => getUniqueAuditLogActions(logs), [logs]);

  const filteredLogs = useMemo(
    () => sortAuditLogs(filterAuditLogs(logs, filters), sort),
    [logs, filters, sort],
  );

  const pagination = useMemo(
    () => paginateAuditLogs(filteredLogs, page, AUDIT_LOG_PAGE_SIZE),
    [filteredLogs, page],
  );

  const handleFiltersChange = useCallback((next: AuditLogFilters) => {
    setFilters(next);
    setPage(1);
  }, []);

  const handleRangeDaysChange = useCallback((next: AuditLogRangeDays) => {
    setRangeDays(next);
    setPage(1);
  }, []);

  const handleSortChange = useCallback((next: AuditLogSort) => {
    setSort(next);
    setPage(1);
  }, []);

  const loadLogs = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    const requestId = loadRequestId.current + 1;
    loadRequestId.current = requestId;
    setIsLoading(true);
    setLoadError(null);

    try {
      const batch = await fetchAuditLogs(accessToken, { rangeDays });
      if (loadRequestId.current === requestId) {
        setLogs(batch.entries);
        setTotal(batch.total);
        setLoadedRangeDays(rangeDays);
      }
    } catch {
      if (loadRequestId.current === requestId) {
        setLoadError("Unable to load audit logs. Please try again.");
        setLogs([]);
        setTotal(0);
        setLoadedRangeDays(rangeDays);
      }
    } finally {
      if (loadRequestId.current === requestId) {
        setIsLoading(false);
      }
    }
  }, [accessToken, rangeDays]);

  useEffect(() => {
    // The leading await defers the effect's first setState past the current
    // tick (react-hooks/set-state-in-effect) without changing behavior.
    void (async () => {
      await Promise.resolve();
      await loadLogs();
    })();
  }, [loadLogs]);

  const handleLoadMore = useCallback(async () => {
    if (!accessToken || isLoadingMore) {
      return;
    }

    setIsLoadingMore(true);
    try {
      const batch = await fetchAuditLogs(accessToken, { offset: logs.length, rangeDays });
      setLogs((current) => [...current, ...batch.entries]);
      setTotal(batch.total);
    } catch {
      setLoadError("Unable to load more audit logs. Please try again.");
    } finally {
      setIsLoadingMore(false);
    }
  }, [accessToken, isLoadingMore, logs.length, rangeDays]);

  // The date-range dimension (rangeDays) is applied server-side and doesn't
  // need this — a range change refetches from scratch via loadLogs. But
  // user/action/result/search still run against `logs` — only what's been
  // fetched so far within that range — while the count shown alongside them
  // is the server-wide total for the range. With more rows in range than
  // loaded, that silently misses older matching entries instead of
  // surfacing an error, which is worse than slow for an audit trail. So
  // fetch every remaining page whenever one of those filters is active or
  // an export is requested, so what's displayed/exported is always
  // complete rather than "whatever happened to be loaded already."
  const loadAllRemaining = useCallback(async (): Promise<AuditLogEntry[]> => {
    if (!accessToken || loadingAllRef.current) {
      return logs;
    }

    loadingAllRef.current = true;
    const requestId = loadRequestId.current;
    setIsLoadingAll(true);
    try {
      let entries = logs;
      let currentTotal = total;
      while (entries.length < currentTotal) {
        const batch = await fetchAuditLogs(accessToken, { offset: entries.length, rangeDays });
        if (batch.entries.length === 0) {
          // Server has fewer rows than `total` claimed (e.g. a concurrent
          // deletion) — stop instead of looping forever.
          break;
        }
        entries = [...entries, ...batch.entries];
        currentTotal = batch.total;
      }
      if (loadRequestId.current === requestId) {
        setLogs(entries);
        setTotal(currentTotal);
        setLoadedRangeDays(rangeDays);
      }
      return entries;
    } catch {
      setLoadError("Unable to load all audit logs. Please try again.");
      return logs;
    } finally {
      loadingAllRef.current = false;
      setIsLoadingAll(false);
    }
  }, [accessToken, logs, total, rangeDays]);

  useEffect(() => {
    if (
      hasActiveAuditLogFilters(filters) &&
      loadedRangeDays === rangeDays &&
      logs.length < total
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- async completion fetch triggered by filter/range state, mirrors loadLogs' mount effect above
      void loadAllRemaining();
    }
  }, [filters, loadedRangeDays, rangeDays, logs.length, total, loadAllRemaining]);

  const signedOutError = accessToken
    ? null
    : "You must be signed in to view audit logs.";
  const effectiveLoading = accessToken ? isLoading : false;
  const effectiveError = signedOutError ?? loadError;
  const hasMore = logs.length < total;

  const handleExport = async () => {
    // Export must reflect every matching row on the server, not just what's
    // been fetched so far — recompute against the freshly-completed set
    // directly rather than the `filteredLogs` memo, which won't reflect
    // loadAllRemaining's state update until the next render.
    const allEntries = hasMore ? await loadAllRemaining() : logs;
    downloadAuditLogsCsv(sortAuditLogs(filterAuditLogs(allEntries, filters), sort));
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
          onClick={() => void handleExport()}
          disabled={effectiveLoading || isLoadingAll || filteredLogs.length === 0}
        >
          <Download className="size-4" aria-hidden="true" />
          {isLoadingAll ? "Loading…" : "Export"}
        </Button>
      </header>

      <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm ring-1 ring-border/60">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex w-fit items-center rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary">
            {hasMore ? `Audit logs (${logs.length} of ${total})` : `Audit logs (${logs.length})`}
          </div>
          {isLoadingAll ? (
            <span className="text-sm text-muted-foreground">
              Loading all matching logs so filtering and export stay accurate…
            </span>
          ) : hasMore && !hasActiveAuditLogFilters(filters) ? (
            // Hidden once a filter is active — loadAllRemaining takes over
            // fetching every remaining page automatically at that point, and
            // letting this button fire a second, independent fetch at the
            // same time could interleave with it and drop rows.
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
          rangeDays={rangeDays}
          onRangeDaysChange={handleRangeDaysChange}
        />
      </div>

      <AuditLogTable
        logs={pagination.items}
        matchingCount={filteredLogs.length}
        totalCount={logs.length}
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
