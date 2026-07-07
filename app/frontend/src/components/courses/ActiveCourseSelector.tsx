import { BookOpen, Loader2 } from "lucide-react";

import { useActiveCourse } from "@/contexts/useActiveCourse";
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

  const isDisabled = isLoading || isSaving || availableCourses.length === 0;

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
          {isLoading ? "Loading courses..." : "Select a course"}
        </option>
        {availableCourses.map((course) => (
          <option key={course.id} value={course.id}>
            {course.code}: {course.name}
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
