import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface FilterOption {
  value: string;
  label: string;
}

interface DataTableToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  searchLabel?: string;
  filterValue?: string;
  onFilterChange?: (value: string) => void;
  filterOptions?: FilterOption[];
  filterLabel?: string;
  className?: string;
}

const selectClassName = cn(
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none",
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
);

export function DataTableToolbar({
  search,
  onSearchChange,
  searchPlaceholder = "Search...",
  searchLabel = "Search",
  filterValue,
  onFilterChange,
  filterOptions,
  filterLabel = "Filter",
  className,
}: DataTableToolbarProps) {
  const showFilter =
    filterOptions && filterOptions.length > 0 && onFilterChange !== undefined;

  return (
    <div
      className={cn(
        "grid gap-3",
        showFilter ? "md:grid-cols-2" : "md:grid-cols-1",
        className,
      )}
    >
      <div className="space-y-1.5">
        <label htmlFor="table-search" className="text-sm font-medium">
          {searchLabel}
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="table-search"
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            className="pl-8"
            aria-label={searchLabel}
          />
        </div>
      </div>

      {showFilter ? (
        <div className="space-y-1.5">
          <label htmlFor="table-filter" className="text-sm font-medium">
            {filterLabel}
          </label>
          <select
            id="table-filter"
            value={filterValue}
            onChange={(event) => onFilterChange(event.target.value)}
            className={selectClassName}
          >
            {filterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}
