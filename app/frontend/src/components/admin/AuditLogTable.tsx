// Admin UI note: presents audit log table controls for institution/admin workflows with service-backed state.

import { AlertCircle, Clock, Loader2 } from "lucide-react";

import { AuditLogColumnMenu } from "@/components/admin/AuditLogColumnMenu";
import { AuditLogPagination } from "@/components/admin/AuditLogPagination";
import { AuditLogRow } from "@/components/admin/AuditLogRow";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AuditLogEntry, AuditLogFilters, AuditLogSort } from "@/types/auditLog";

interface AuditLogTableProps {
  logs: AuditLogEntry[];
  matchingCount: number;
  totalCount: number;
  startIndex: number;
  endIndex: number;
  page: number;
  totalPages: number;
  sort: AuditLogSort;
  filters: AuditLogFilters;
  onSortChange: (sort: AuditLogSort) => void;
  onFiltersChange: (filters: AuditLogFilters) => void;
  onPageChange: (page: number) => void;
  onRetry?: () => void;
  isLoading?: boolean;
  errorMessage?: string | null;
}

function formatRangeFooter(
  startIndex: number,
  endIndex: number,
  matchingCount: number,
  totalCount: number,
): string {
  if (matchingCount === 0) {
    return `Showing 0 of ${totalCount} audit logs`;
  }

  const range =
    startIndex === endIndex
      ? `${startIndex}`
      : `${startIndex}–${endIndex}`;

  if (matchingCount === totalCount) {
    return `Showing ${range} of ${totalCount} audit logs`;
  }

  return `Showing ${range} of ${matchingCount} matching audit logs (${totalCount} total)`;
}

export function AuditLogTable({
  logs,
  matchingCount,
  totalCount,
  startIndex,
  endIndex,
  page,
  totalPages,
  sort,
  filters,
  onSortChange,
  onFiltersChange,
  onPageChange,
  onRetry,
  isLoading = false,
  errorMessage = null,
}: AuditLogTableProps) {
  if (isLoading) {
    return (
      <Card className="shadow-sm ring-1 ring-border/60">
        <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="size-5 animate-spin text-primary" aria-hidden="true" />
          Loading audit logs...
        </CardContent>
      </Card>
    );
  }

  if (errorMessage) {
    return (
      <Card className="border-destructive/30 shadow-sm ring-1 ring-destructive/20">
        <CardContent className="flex flex-col items-center gap-4 py-10 text-sm text-destructive sm:flex-row sm:justify-center">
          <div className="flex items-center gap-3">
            <AlertCircle className="size-5 shrink-0" aria-hidden="true" />
            <span role="alert">{errorMessage}</span>
          </div>
          {onRetry ? (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              Try again
            </Button>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  if (matchingCount === 0) {
    return (
      <Card className="shadow-sm ring-1 ring-border/60">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No audit logs found.
        </CardContent>
        <CardFooter className="justify-center border-t py-3 text-xs text-muted-foreground">
          {formatRangeFooter(startIndex, endIndex, matchingCount, totalCount)}
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden shadow-sm ring-1 ring-border/60">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" aria-label="Expand row" />
                <TableHead className="min-w-[10.5rem]">
                  <div className="flex items-center gap-1">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="size-3.5" aria-hidden="true" />
                      Timestamp
                    </span>
                    <AuditLogColumnMenu
                      field="timestamp"
                      label="timestamp"
                      sort={sort}
                      defaultSortLabel="Newest first"
                      onSortChange={onSortChange}
                      sortOptions={[
                        { value: "asc", label: "Oldest first" },
                      ]}
                    />
                  </div>
                </TableHead>
                <TableHead className="min-w-[9rem]">
                  <div className="flex items-center gap-1">
                    <span>User</span>
                    <AuditLogColumnMenu
                      field="user"
                      label="user"
                      sort={sort}
                      onSortChange={onSortChange}
                      sortOptions={[
                        { value: "asc", label: "A to Z" },
                        { value: "desc", label: "Z to A" },
                      ]}
                    />
                  </div>
                </TableHead>
                <TableHead className="min-w-[9rem]">
                  <div className="flex items-center gap-1">
                    <span>Action</span>
                    <AuditLogColumnMenu
                      field="action"
                      label="action"
                      sort={sort}
                      onSortChange={onSortChange}
                      sortOptions={[
                        { value: "asc", label: "A to Z" },
                        { value: "desc", label: "Z to A" },
                      ]}
                    />
                  </div>
                </TableHead>
                <TableHead className="min-w-[10rem]">
                  <div className="flex items-center gap-1">
                    <span>Resource</span>
                    <AuditLogColumnMenu
                      field="resource"
                      label="resource"
                      sort={sort}
                      onSortChange={onSortChange}
                      sortOptions={[
                        { value: "asc", label: "A to Z" },
                        { value: "desc", label: "Z to A" },
                      ]}
                    />
                  </div>
                </TableHead>
                <TableHead className="min-w-[8rem]">
                  <div className="flex items-center gap-1">
                    <span>Result</span>
                    <AuditLogColumnMenu
                      field="result"
                      label="result"
                      sort={sort}
                      onSortChange={onSortChange}
                      sortOptions={[
                        { value: "asc", label: "Failed first" },
                        { value: "desc", label: "Success first" },
                      ]}
                      resultFilter={filters.result}
                      resultFilterOptions={[
                        { value: "", label: "All results" },
                        { value: "success", label: "Success only" },
                        { value: "failed", label: "Failed only" },
                        { value: "unknown", label: "Unknown only" },
                      ]}
                      onResultFilterChange={(result) =>
                        onFiltersChange({ ...filters, result })
                      }
                    />
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <AuditLogRow key={log.id} log={log} />
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col gap-3 border-t py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {formatRangeFooter(startIndex, endIndex, matchingCount, totalCount)}
        </p>
        <AuditLogPagination
          page={page}
          totalPages={totalPages}
          onPageChange={onPageChange}
        />
      </CardFooter>
    </Card>
  );
}
