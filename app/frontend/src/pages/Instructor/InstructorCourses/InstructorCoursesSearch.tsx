import { Filter, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CoursePublishFilter } from "@/types/course";

interface InstructorCoursesSearchProps {
  search: string;
  onSearchChange: (value: string) => void;
  publishFilter: CoursePublishFilter;
  onPublishFilterChange: (value: CoursePublishFilter) => void;
}

const selectClassName = cn(
  "h-9 rounded-lg border border-input bg-background pl-8 pr-3 text-sm outline-none",
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
);

export function InstructorCoursesSearch({
  search,
  onSearchChange,
  publishFilter,
  onPublishFilterChange,
}: InstructorCoursesSearchProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative max-w-xl flex-1">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          placeholder="Search courses..."
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          className="pl-8"
          aria-label="Search courses"
        />
      </div>

      <div className="relative">
        <Filter
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <select
          value={publishFilter}
          onChange={(event) =>
            onPublishFilterChange(event.target.value as CoursePublishFilter)
          }
          className={selectClassName}
          aria-label="Filter by publish status"
        >
          <option value="all">All courses</option>
          <option value="published">Published only</option>
          <option value="unpublished">Unpublished only</option>
        </select>
      </div>
    </div>
  );
}
