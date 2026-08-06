// Component note: renders reusable active course context bar UI for the instructor/admin experience.

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

  // Compact single row: the selector already shows the course name. Keep a
  // short empty-state hint only when nothing is selected (#1454).
  return (
    <section
      aria-label="Active course context"
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5"
    >
      <label
        htmlFor="active-course-selector"
        className="text-sm font-medium text-foreground"
      >
        Course
      </label>
      <ActiveCourseSelector
        className="min-w-[12rem] flex-1 sm:flex-none"
        hasPendingAssistantWork={hasPendingAssistantWork}
      />
      {!isLoading && !activeCourse ? (
        <p className="basis-full text-xs text-muted-foreground sm:basis-auto">
          Select a course to scope assistant actions.
        </p>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="flex basis-full items-start gap-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}
    </section>
  );
}
