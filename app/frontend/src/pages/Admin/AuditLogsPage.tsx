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
  defaultAuditLogSort,
  emptyAuditLogFilters,
  type AuditLogEntry,
  type AuditLogFilters,
  type AuditLogSort,
} from "@/types/auditLog";
import { pageShellXWide } from "@/lib/page-shell";

export function AuditLogsPage() {
  const { accessToken } = useAuth();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [filters, setFilters] = useState<AuditLogFilters>(emptyAuditLogFilters);
  const [sort, setSort] = useState<AuditLogSort>(defaultAuditLogSort);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadRequestId = useRef(0);

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

  const handleSortChange = useCallback((next: AuditLogSort) => {
    setSort(next);
    setPage(1);
  }, []);

  const loadLogs = useCallback(async () => {
    const requestId = loadRequestId.current + 1;
    loadRequestId.current = requestId;
    setIsLoading(true);
    setLoadError(null);

    try {
      const data = await fetchAuditLogs(accessToken!);
      if (loadRequestId.current === requestId) {
        setLogs(data);
      }
    } catch {
      if (loadRequestId.current === requestId) {
        setLoadError("Unable to load audit logs. Please try again.");
        setLogs([]);
      }
    } finally {
      if (loadRequestId.current === requestId) {
        setIsLoading(false);
      }
    }
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let cancelled = false;
    const requestId = loadRequestId.current + 1;
    loadRequestId.current = requestId;

    void (async () => {
      await Promise.resolve();
      if (cancelled || loadRequestId.current !== requestId) {
        return;
      }

      setIsLoading(true);
      setLoadError(null);

      try {
        const data = await fetchAuditLogs(accessToken);
        if (!cancelled && loadRequestId.current === requestId) {
          setLogs(data);
        }
      } catch {
        if (!cancelled && loadRequestId.current === requestId) {
          setLoadError("Unable to load audit logs. Please try again.");
          setLogs([]);
        }
      } finally {
        if (!cancelled && loadRequestId.current === requestId) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const signedOutError = accessToken
    ? null
    : "You must be signed in to view audit logs.";
  const effectiveLoading = accessToken ? isLoading : false;
  const effectiveError = signedOutError ?? loadError;

  const handleExport = () => {
    downloadAuditLogsCsv(filteredLogs);
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
          disabled={effectiveLoading || filteredLogs.length === 0}
        >
          <Download className="size-4" aria-hidden="true" />
          Export
        </Button>
      </header>

      <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm ring-1 ring-border/60">
        <div className="inline-flex w-fit items-center rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary">
          Audit logs ({logs.length})
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
