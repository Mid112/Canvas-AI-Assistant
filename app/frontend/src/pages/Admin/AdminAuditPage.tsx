import { useEffect, useMemo, useState } from "react";

import { DataTableToolbar } from "@/components/common/DataTableToolbar";
import { TablePagination } from "@/components/common/TablePagination";
import { WorkflowStatusBadge } from "@/components/history/WorkflowStatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatRelativeTime } from "@/lib/format-relative-time";
import {
  DEFAULT_PAGE_SIZE,
  paginateItems,
} from "@/lib/table-pagination";
import { searchActionHistory } from "@/services/actionHistory";
import type { ActionHistoryEntry } from "@/types/actionHistory";

export function AdminAuditPage() {
  const [entries, setEntries] = useState<ActionHistoryEntry[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadAuditLogs() {
      setIsLoading(true);
      try {
        const data = await searchActionHistory(search, statusFilter);
        if (!cancelled) {
          setEntries(data);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadAuditLogs();

    return () => {
      cancelled = true;
    };
  }, [search, statusFilter]);

  const paginated = useMemo(
    () => paginateItems(entries, page, pageSize),
    [entries, page, pageSize],
  );

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value);
    setPage(1);
  };

  const handlePageSizeChange = (value: number) => {
    setPageSize(value);
    setPage(1);
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Audit Logs
        </h1>
        <p className="text-muted-foreground">
          Review workflow requests and execution outcomes across all instructors.
        </p>
      </header>

      <DataTableToolbar
        search={search}
        onSearchChange={handleSearchChange}
        searchLabel="Search audit logs"
        searchPlaceholder="Search by request, course, or instructor..."
        filterValue={statusFilter}
        onFilterChange={handleStatusFilterChange}
        filterLabel="Execution status"
        filterOptions={[
          { value: "all", label: "All statuses" },
          { value: "pending", label: "Pending" },
          { value: "approved", label: "Approved" },
          { value: "executed", label: "Executed" },
          { value: "rejected", label: "Rejected" },
          { value: "failed", label: "Failed" },
        ]}
      />

      <Card className="overflow-hidden shadow-sm ring-1 ring-border/60">
        <CardContent className="p-0">
          {isLoading ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Loading audit logs...
            </p>
          ) : paginated.totalItems === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No audit logs match your filters.
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>Instructor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Requested</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.items.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium">{entry.actionType}</p>
                          <p className="text-sm text-muted-foreground">
                            {entry.originalRequest}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {entry.courseLabel}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>{entry.requestedBy}</TableCell>
                      <TableCell>
                        <WorkflowStatusBadge status={entry.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatRelativeTime(entry.requestedAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePagination
                page={paginated.page}
                totalPages={paginated.totalPages}
                totalItems={paginated.totalItems}
                pageSize={paginated.pageSize}
                onPageChange={setPage}
                onPageSizeChange={handlePageSizeChange}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
