import { AlertCircle } from "lucide-react";

import { ActiveCourseSelector } from "@/components/courses/ActiveCourseSelector";
import { useActiveCourse } from "@/contexts/useActiveCourse";

export function ActiveCourseContextBar() {
  const { activeCourse, error, isLoading } = useActiveCourse();

  return (
    <div className="border-b border-border/70 bg-background px-4 py-3 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Active course context
          </p>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading active course...</p>
          ) : activeCourse ? (
            <p className="truncate text-sm font-medium">{activeCourse.displayName}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No active course selected. Choose a course to scope assistant and
              workflow actions in this session.
            </p>
          )}
        </div>
        <ActiveCourseSelector />
      </div>

      {error ? (
        <div
          role="alert"
          className="mt-3 flex items-start gap-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}
    </div>
  );
}
