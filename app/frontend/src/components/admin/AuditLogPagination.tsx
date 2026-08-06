import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

interface AuditLogPaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function AuditLogPagination({
  page,
  totalPages,
  onPageChange,
}: AuditLogPaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        Previous
      </Button>
      <span className="text-xs text-muted-foreground">
        Page {page} of {totalPages}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Next page"
      >
        Next
        <ChevronRight className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
