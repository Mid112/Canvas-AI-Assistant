import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AuditLogTable } from "@/components/admin/AuditLogTable";
import { emptyAuditLogFilters } from "@/types/auditLog";

const defaultSort = { field: "timestamp" as const, direction: "desc" as const };

describe("AuditLogTable", () => {
  // Verifies: Shows an error message without a retry button when onRetry is omitted.
  it("shows an error message without a retry button when onRetry is omitted", () => {
    render(
      <AuditLogTable
        logs={[]}
        matchingCount={0}
        totalCount={0}
        startIndex={0}
        endIndex={0}
        page={1}
        totalPages={1}
        sort={defaultSort}
        filters={emptyAuditLogFilters}
        onSortChange={vi.fn()}
        onFiltersChange={vi.fn()}
        onPageChange={vi.fn()}
        errorMessage="Unable to load audit logs."
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Unable to load audit logs.",
    );
    expect(
      screen.queryByRole("button", { name: "Try again" }),
    ).not.toBeInTheDocument();
  });
});
