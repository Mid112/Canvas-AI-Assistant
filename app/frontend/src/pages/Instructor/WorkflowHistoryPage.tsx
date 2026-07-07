import { AlertCircle, Download, Loader2, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AuditLogPagination } from "@/components/admin/AuditLogPagination";
import { WorkflowHistoryTable } from "@/components/workflow/WorkflowHistoryTable";
import { WorkflowStatusSummary } from "@/components/workflow/WorkflowStatusSummary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import {
  filterWorkflowHistory,
  paginateWorkflowHistory,
  sortWorkflowHistoryByDate,
} from "@/lib/workflow-history-query";
import {
  downloadWorkflowHistoryCsv,
  fetchWorkflowHistory,
  getWorkflowHistoryStatusCounts,
  WorkflowHistoryApiError,
} from "@/services/workflowHistory";
import {
  WORKFLOW_HISTORY_PAGE_SIZE,
  emptyWorkflowHistoryFilters,
  hasActiveWorkflowHistoryFilters,
  type WorkflowHistoryEntry,
  type WorkflowHistoryFilters,
  type WorkflowStatus,
} from "@/types/workflowHistory";

export function WorkflowHistoryPage() {
  const { accessToken } = useAuth();
  const [entries, setEntries] = useState<WorkflowHistoryEntry[]>([]);
  const [totalWorkflows, setTotalWorkflows] = useState(0);
  const [filters, setFilters] = useState<WorkflowHistoryFilters>(
    emptyWorkflowHistoryFilters,
  );
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const filteredEntries = useMemo(
    () =>
      sortWorkflowHistoryByDate(filterWorkflowHistory(entries, filters)),
    [entries, filters],
  );

  const pagination = useMemo(
    () =>
      paginateWorkflowHistory(
        filteredEntries,
        page,
        WORKFLOW_HISTORY_PAGE_SIZE,
      ),
    [filteredEntries, page],
  );

  const statusCounts = useMemo(
    () => getWorkflowHistoryStatusCounts(entries),
    [entries],
  );

  const showClear = hasActiveWorkflowHistoryFilters(filters);

  const handleFiltersChange = useCallback(
    (next: WorkflowHistoryFilters) => {
      setFilters(next);
      setPage(1);
    },
    [],
  );

  const handleStatusFilter = useCallback(
    (status: WorkflowStatus | "") => {
      handleFiltersChange({ ...filters, status });
    },
    [filters, handleFiltersChange],
  );

  const loadEntries = useCallback(async () => {
    if (!accessToken) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    try {
      const data = await fetchWorkflowHistory(accessToken);
      setEntries(data.entries);
      setTotalWorkflows(data.total);
    } catch (error) {
      const message =
        error instanceof WorkflowHistoryApiError
          ? error.message
          : "Unable to load workflow history. Please try again.";
      setLoadError(message);
      setEntries([]);
      setTotalWorkflows(0);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data load
    void loadEntries();
  }, [loadEntries]);

  const handleExport = () => {
    downloadWorkflowHistoryCsv(filteredEntries);
  };

  function formatFooter(): string {
    const total = totalWorkflows || entries.length;
    const matching = filteredEntries.length;

    if (matching === 0) {
      return `Showing 0 of ${total} workflows`;
    }

    const { startIndex, endIndex } = pagination;
    const range =
      startIndex === endIndex ? `${startIndex}` : `${startIndex}–${endIndex}`;

    if (matching === total) {
      return `Showing ${range} of ${total} workflows`;
    }

    return `Showing ${range} of ${matching} matching workflows (${total} total)`;
  }

  if (isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-6 lg:p-8">
        <Card className="shadow-sm ring-1 ring-border/60">
          <CardContent className="flex items-center justify-center gap-3 py-16 text-sm text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            Loading workflow history…
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-6 lg:p-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Workflow Audit Log
          </h1>
          <p className="text-sm text-muted-foreground">
            Track all AI-generated workflow actions.
          </p>
        </div>
        <Button
          type="button"
          onClick={handleExport}
          disabled={filteredEntries.length === 0}
        >
          <Download className="size-4" aria-hidden="true" />
          Export Log
        </Button>
      </header>

      {loadError ? (
        <Card className="border-destructive/30 shadow-sm ring-1 ring-destructive/20">
          <CardContent className="flex flex-col items-start gap-3 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 text-destructive">
              <AlertCircle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <div className="space-y-1">
                <p role="alert">{loadError}</p>
                <p className="text-muted-foreground">
                  If this persists after retrying, apply the latest database
                  migrations or run <code>make db-reset</code> for local dev.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadEntries()}
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              aria-label="Search workflows"
              placeholder="Search workflows..."
              value={filters.search}
              onChange={(event) =>
                handleFiltersChange({ ...filters, search: event.target.value })
              }
              className="pl-8"
            />
          </div>
          <div className="flex gap-1">
            {(["", "approved", "rejected", "pending"] as const).map(
              (status) => (
                <Button
                  key={status || "all"}
                  type="button"
                  variant={filters.status === status ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleStatusFilter(status)}
                >
                  {status === ""
                    ? "All"
                    : status.charAt(0).toUpperCase() + status.slice(1)}
                </Button>
              ),
            )}
          </div>
        </div>

        {showClear ? (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleFiltersChange(emptyWorkflowHistoryFilters)}
            >
              <X className="size-4" aria-hidden="true" />
              Clear filters
            </Button>
          </div>
        ) : null}
      </div>

      <Card className="shadow-sm ring-1 ring-border/60">
        <CardContent className="p-0">
          <WorkflowHistoryTable entries={pagination.items} />
        </CardContent>
        <CardFooter className="flex items-center justify-between border-t py-3 text-xs text-muted-foreground">
          <span>{formatFooter()}</span>
          <AuditLogPagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            onPageChange={setPage}
          />
        </CardFooter>
      </Card>

      <WorkflowStatusSummary counts={statusCounts} />
    </div>
  );
}
