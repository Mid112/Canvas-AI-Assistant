import { ListFilter } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  defaultAuditLogSort,
  type AuditLogFilters,
  type AuditLogResult,
  type AuditLogSort,
  type AuditLogSortDirection,
  type AuditLogSortField,
} from "@/types/auditLog";

interface SortOption {
  value: AuditLogSortDirection;
  label: string;
}

interface ResultFilterOption {
  value: "" | AuditLogResult;
  label: string;
}

interface AuditLogColumnMenuProps {
  field: AuditLogSortField;
  label: string;
  sort: AuditLogSort;
  sortOptions: SortOption[];
  defaultSortLabel?: string;
  onSortChange: (sort: AuditLogSort) => void;
  resultFilter?: AuditLogFilters["result"];
  resultFilterOptions?: ResultFilterOption[];
  onResultFilterChange?: (result: AuditLogFilters["result"]) => void;
}

function isDefaultAuditSort(sort: AuditLogSort): boolean {
  return (
    sort.field === defaultAuditLogSort.field &&
    sort.direction === defaultAuditLogSort.direction
  );
}

/** Empty when another column is sorted so "Default" stays clickable. */
function getSortRadioValue(sort: AuditLogSort, field: AuditLogSortField): string {
  if (sort.field !== field) {
    return "";
  }

  if (isDefaultAuditSort(sort)) {
    return "default";
  }

  return sort.direction;
}

export function AuditLogColumnMenu({
  field,
  label,
  sort,
  sortOptions,
  defaultSortLabel = "Default",
  onSortChange,
  resultFilter,
  resultFilterOptions,
  onResultFilterChange,
}: AuditLogColumnMenuProps) {
  const isSortActive = sort.field === field && !isDefaultAuditSort(sort);
  const isFilterActive = Boolean(resultFilter);
  const isActive = isSortActive || isFilterActive;

  const sortValue = getSortRadioValue(sort, field);

  function handleSortChange(value: string) {
    if (value === "default") {
      onSortChange(defaultAuditLogSort);
      return;
    }

    onSortChange({
      field,
      direction: value as AuditLogSortDirection,
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors",
          "hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          isActive && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
        )}
        aria-label={`Filter ${label} column`}
      >
        <ListFilter className="size-3.5" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Sort</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={sortValue} onValueChange={handleSortChange}>
            <DropdownMenuRadioItem value="default">{defaultSortLabel}</DropdownMenuRadioItem>
            {sortOptions.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>

        {resultFilterOptions && onResultFilterChange ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Filter</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={resultFilter || "all"}
                onValueChange={(value) =>
                  onResultFilterChange(
                    value === "all" ? "" : (value as AuditLogResult),
                  )
                }
              >
                {resultFilterOptions.map((option) => (
                  <DropdownMenuRadioItem
                    key={option.value || "all"}
                    value={option.value || "all"}
                  >
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
