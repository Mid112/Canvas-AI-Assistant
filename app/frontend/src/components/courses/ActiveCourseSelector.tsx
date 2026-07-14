import { useMemo } from "react";
import { BookOpen, Loader2 } from "lucide-react";

import { useActiveCourse } from "@/contexts/useActiveCourse";
import { disambiguateCourseLabels } from "@/lib/disambiguate-course-labels";
import { cn } from "@/lib/utils";

const selectClassName = cn(
  "h-9 min-w-[12rem] max-w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none",
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
);

interface ActiveCourseSelectorProps {
  id?: string;
  className?: string;
}

export function ActiveCourseSelector({
  id = "active-course-selector",
  className,
}: ActiveCourseSelectorProps) {
  const {
    activeCourse,
    availableCourses,
    isLoading,
    isSaving,
    selectActiveCourse,
  } = useActiveCourse();

  // Setting a course active is an action, not just a display — only offer
  // published courses here, same as the assignment-creation course picker.
  const selectableCourses = useMemo(
    () => availableCourses.filter((course) => course.isPublished),
    [availableCourses],
  );
  const labelById = useMemo(
    () => disambiguateCourseLabels(selectableCourses),
    [selectableCourses],
  );

  const isDisabled = isLoading || isSaving || selectableCourses.length === 0;
  const emptyOptionLabel = isLoading
    ? "Loading courses..."
    : availableCourses.length > 0 && selectableCourses.length === 0
      ? "No published courses available"
      : "Select a course";

  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <label htmlFor={id} className="sr-only">
        Active course
      </label>
      <BookOpen
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <select
        id={id}
        value={activeCourse?.localId ?? ""}
        onChange={(event) => {
          const value = Number(event.target.value);
          if (Number.isInteger(value) && value > 0) {
            void selectActiveCourse(value);
          }
        }}
        disabled={isDisabled}
        className={selectClassName}
        aria-label="Select active course"
      >
        <option value="" disabled>
          {emptyOptionLabel}
        </option>
        {selectableCourses.map((course) => (
          <option key={course.id} value={course.id}>
            {labelById.get(course.id)}
          </option>
        ))}
      </select>
      {isSaving ? (
        <Loader2
          className="size-4 shrink-0 animate-spin text-muted-foreground"
          aria-label="Saving active course"
        />
      ) : null}
    </div>
  );
}
