import { AlertCircle, Download, Loader2, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AuditLogPagination } from "@/components/admin/AuditLogPagination";
import { AdminToast } from "@/components/admin/AdminToast";
import { ConfirmationDialog } from "@/components/admin/ConfirmationDialog";
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
  cancelWorkflow,
  downloadWorkflowHistoryCsv,
  fetchWorkflowHistory,
  getWorkflowHistoryStatusCounts,
  undoWorkflow,
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
  const [actionError, setActionError] = useState<string | null>(null);
  // Track every in-flight cancel by id so clicking a second row does not
  // re-enable an earlier row's button while its request is still running.
  const [actingWorkflowIds, setActingWorkflowIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [undoTarget, setUndoTarget] = useState<WorkflowHistoryEntry | null>(null);
  const [isUndoing, setIsUndoing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

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

  // Undoing a create_assignment permanently deletes the Canvas assignment —
  // a materially more destructive, unrecoverable action than undoing an
  // edit (which just re-applies the prior field values). The confirmation
  // copy calls that out explicitly rather than showing the same generic
  // "Undo this action" text for both.
  const undoConfirmCopy = useMemo(() => {
    if (!undoTarget) {
      return { title: "", description: "", confirmLabel: "" };
    }
    if (undoTarget.actionName === "create_assignment") {
      return {
        title: "Delete this assignment",
        description: `Undo "${undoTarget.workflowName}"? This permanently deletes the assignment from Canvas. This cannot be undone.`,
        confirmLabel: "Delete assignment",
      };
    }
    return {
      title: "Undo this action",
      description: `Undo "${undoTarget.workflowName}"? This reverts the assignment back to its state before this action.`,
      confirmLabel: "Undo action",
    };
  }, [undoTarget]);

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

  const handleCancelPending = async (entry: WorkflowHistoryEntry) => {
    if (!accessToken || actingWorkflowIds.has(entry.id)) {
      return;
    }
    setActingWorkflowIds((current) => new Set(current).add(entry.id));
    setActionError(null);
    try {
      const updated = await cancelWorkflow(accessToken, entry.id);
      setEntries((current) =>
        current.map((item) => (item.id === entry.id ? updated : item)),
      );
    } catch (error) {
      const message =
        error instanceof WorkflowHistoryApiError
          ? error.message
          : "Unable to cancel this workflow.";
      setActionError(message);
      throw error;
    } finally {
      setActingWorkflowIds((current) => {
        const next = new Set(current);
        next.delete(entry.id);
        return next;
      });
    }
  };

  const handleConfirmUndo = async () => {
    if (!undoTarget || !accessToken) {
      return;
    }

    setIsUndoing(true);
    try {
      await undoWorkflow(accessToken, undoTarget.id);
      const successMessage =
        undoTarget.actionName === "create_assignment"
          ? `"${undoTarget.workflowName}" was undone — the assignment was deleted.`
          : `"${undoTarget.workflowName}" was undone.`;
      setToast({ message: successMessage, type: "success" });
      setUndoTarget(null);
      await loadEntries();
    } catch (error) {
      // 409 (already undone) and 422 (no prior state recorded) both carry
      // their own actionable detail text from the backend — surface it
      // directly rather than a generic failure message.
      const message =
        error instanceof WorkflowHistoryApiError
          ? error.message
          : "Unable to undo this action. Please try again.";
      setToast({ message, type: "error" });
      setUndoTarget(null);
    } finally {
      setIsUndoing(false);
    }
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
          <WorkflowHistoryTable
            entries={pagination.items}
            onCancelPending={handleCancelPending}
            actionError={actionError}
            actingWorkflowIds={actingWorkflowIds}
            onUndo={(entry) => setUndoTarget(entry)}
          />
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

      <ConfirmationDialog
        open={undoTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setUndoTarget(null);
          }
        }}
        title={undoConfirmCopy.title}
        description={undoConfirmCopy.description}
        confirmLabel={undoConfirmCopy.confirmLabel}
        variant="destructive"
        isLoading={isUndoing}
        onConfirm={() => void handleConfirmUndo()}
      />

      {toast ? (
        <AdminToast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      ) : null}
    </div>
  );
}
