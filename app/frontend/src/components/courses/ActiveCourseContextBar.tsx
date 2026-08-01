import { AlertCircle } from "lucide-react";

import { ActiveCourseSelector } from "@/components/courses/ActiveCourseSelector";
import { useActiveCourse } from "@/contexts/useActiveCourse";

interface ActiveCourseContextBarProps {
  hasPendingAssistantWork?: () => boolean;
}

export function ActiveCourseContextBar({
  hasPendingAssistantWork,
}: ActiveCourseContextBarProps) {
  const { activeCourse, error, isLoading } = useActiveCourse();

  // The selector's own <select> already displays the active course's name
  // as its selected option (and "Loading courses..." while isLoading) — a
  // second, static copy of the same name here was pure duplication. The one
  // thing the selector's placeholder doesn't convey on its own is *why*
  // nothing is selected, so that explanation is kept here for the
  // genuinely-empty case only.
  return (
    <section
      aria-label="Active course context"
      className="shrink-0 rounded-lg border border-border/80 bg-card px-3 py-2.5 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <span
            className="mt-0.5 h-5 w-1 shrink-0 rounded-full bg-primary"
            aria-hidden="true"
          />
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold text-foreground">
              Active course context
            </p>
          {!isLoading && !activeCourse ? (
            <p className="text-sm text-muted-foreground">
              No active course selected. Choose a course to scope assistant and
              workflow actions in this session.
            </p>
          ) : null}
          </div>
        </div>
        <ActiveCourseSelector
          className="rounded-lg bg-muted/50 px-2 py-1"
          hasPendingAssistantWork={hasPendingAssistantWork}
        />
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
    </section>
  );
}
