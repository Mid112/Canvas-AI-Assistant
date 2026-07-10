import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CoursePublishFilter } from "@/types/course";

const PUBLISH_FILTERS: { value: CoursePublishFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "published", label: "Published" },
  { value: "unpublished", label: "Unpublished" },
];

interface InstructorCoursesSearchProps {
  search: string;
  onSearchChange: (value: string) => void;
  publishFilter: CoursePublishFilter;
  onPublishFilterChange: (value: CoursePublishFilter) => void;
}

export function InstructorCoursesSearch({
  search,
  onSearchChange,
  publishFilter,
  onPublishFilterChange,
}: InstructorCoursesSearchProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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

      <div
        className="flex flex-wrap items-center gap-1 rounded-lg border border-border/70 bg-muted/30 p-1"
        role="group"
        aria-label="Filter by publish status"
      >
        {PUBLISH_FILTERS.map((filter) => (
          <Button
            key={filter.value}
            type="button"
            size="sm"
            variant={publishFilter === filter.value ? "default" : "ghost"}
            className={cn(
              "h-8",
              publishFilter !== filter.value && "text-muted-foreground",
            )}
            aria-pressed={publishFilter === filter.value}
            onClick={() => onPublishFilterChange(filter.value)}
          >
            {filter.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
