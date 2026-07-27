import { Filter, Search, User, X } from "lucide-react";

import { SearchCombobox } from "@/components/admin/SearchCombobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  emptyAuditLogFilters,
  hasActiveAuditLogFilters,
  type AuditLogFilters,
} from "@/types/auditLog";

interface AuditLogFiltersProps {
  filters: AuditLogFilters;
  userOptions: string[];
  actionOptions: string[];
  onChange: (filters: AuditLogFilters) => void;
}

function updateFilter(
  filters: AuditLogFilters,
  key: keyof AuditLogFilters,
  value: string,
): AuditLogFilters {
  return { ...filters, [key]: value };
}

export function AuditLogFiltersBar({
  filters,
  userOptions,
  actionOptions,
  onChange,
}: AuditLogFiltersProps) {
  const showClear = hasActiveAuditLogFilters(filters);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[9.5rem_minmax(10rem,0.9fr)_minmax(13rem,1.3fr)_minmax(9rem,1fr)]">
        <Input
          type="date"
          aria-label="Filter by date"
          title="yyyy-mm-dd"
          value={filters.date}
          onChange={(event) =>
            onChange(updateFilter(filters, "date", event.target.value))
          }
        />

        <SearchCombobox
          value={filters.user}
          options={userOptions}
          onChange={(user) => onChange(updateFilter(filters, "user", user))}
          ariaLabel="Filter by user"
          placeholder="User"
          allOptionLabel="All users"
          emptyMessage="No users match your search."
          listboxLabel="Audit log users"
          icon={User}
        />

        <SearchCombobox
          value={filters.action}
          options={actionOptions}
          onChange={(action) => onChange(updateFilter(filters, "action", action))}
          ariaLabel="Filter by action"
          placeholder="Action"
          allOptionLabel="All actions"
          emptyMessage="No actions match your search."
          listboxLabel="Audit log actions"
          icon={Filter}
        />

        <div className="relative min-w-0">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            aria-label="Search logs"
            placeholder="Search..."
            value={filters.search}
            onChange={(event) =>
              onChange(updateFilter(filters, "search", event.target.value))
            }
            className="pl-8"
          />
        </div>
      </div>

      {showClear ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(emptyAuditLogFilters)}
          >
            <X className="size-4" aria-hidden="true" />
            Clear filters
          </Button>
        </div>
      ) : null}
    </div>
  );
}
