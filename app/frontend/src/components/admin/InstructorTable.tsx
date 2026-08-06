import { AlertCircle, Loader2 } from "lucide-react";

import { InstructorRow } from "@/components/admin/InstructorRow";
import { TablePagination } from "@/components/common/TablePagination";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Instructor } from "@/types/instructor";

interface InstructorTableProps {
  instructors: Instructor[];
  /** Count of instructors matching the current search, across all pages. */
  matchedCount: number;
  /** Count of all instructor accounts, ignoring the current search. */
  totalCount: number;
  page?: number;
  totalPages?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  isLoading?: boolean;
  errorMessage?: string | null;
  onEdit: (instructor: Instructor) => void;
  onEnable: (instructor: Instructor) => void;
  onDisable: (instructor: Instructor) => void;
  onRevoke: (instructor: Instructor) => void;
  onManageCanvasConnections: (instructor: Instructor) => void;
}

export function InstructorTable({
  instructors,
  matchedCount,
  totalCount,
  page = 1,
  totalPages = 1,
  pageSize = matchedCount,
  onPageChange,
  onPageSizeChange,
  isLoading = false,
  errorMessage = null,
  onEdit,
  onEnable,
  onDisable,
  onRevoke,
  onManageCanvasConnections,
}: InstructorTableProps) {
  if (isLoading) {
    return (
      <Card className="shadow-sm ring-1 ring-border/60">
        <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="size-5 animate-spin text-primary" aria-hidden="true" />
          Loading instructors...
        </CardContent>
      </Card>
    );
  }

  if (errorMessage) {
    return (
      <Card className="border-destructive/30 shadow-sm ring-1 ring-destructive/20">
        <CardContent className="flex items-center gap-3 py-10 text-sm text-destructive">
          <AlertCircle className="size-5 shrink-0" aria-hidden="true" />
          {errorMessage}
        </CardContent>
      </Card>
    );
  }

  if (matchedCount === 0) {
    return (
      <Card className="shadow-sm ring-1 ring-border/60">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No instructor accounts found.
        </CardContent>
        <CardFooter className="justify-center border-t py-3 text-xs text-muted-foreground">
          Showing 0 of {totalCount} instructors
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
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created Date</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {instructors.map((instructor) => (
                <InstructorRow
                  key={instructor.id}
                  instructor={instructor}
                  onEdit={onEdit}
                  onEnable={onEnable}
                  onDisable={onDisable}
                  onRevoke={onRevoke}
                  onManageCanvasConnections={onManageCanvasConnections}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      {onPageChange ? (
        <TablePagination
          page={page}
          totalPages={totalPages}
          totalItems={matchedCount}
          pageSize={pageSize}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      ) : (
        <CardFooter className="justify-center border-t py-3 text-xs text-muted-foreground">
          Showing {matchedCount} of {totalCount} instructors
        </CardFooter>
      )}
    </Card>
  );
}
