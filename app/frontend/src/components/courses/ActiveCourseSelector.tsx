import { useMemo, useState, type ChangeEvent } from "react";
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
  /** When true (default), warn before switching away from an active course
   * mid-assistant work so the instructor understands the conversation may
   * fork onto a new thread for the new course (#1186). */
  warnOnSwitch?: boolean;
  /** Optional hook: return true when chat has a pending preview / mid-workflow. */
  hasPendingAssistantWork?: () => boolean;
}

export function ActiveCourseSelector({
  id = "active-course-selector",
  className,
  warnOnSwitch = true,
  hasPendingAssistantWork,
}: ActiveCourseSelectorProps) {
  const {
    activeCourse,
    availableCourses,
    isLoading,
    isSaving,
    selectActiveCourse,
  } = useActiveCourse();
  const [pendingValue, setPendingValue] = useState<number | null>(null);

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

  const applyCourse = async (courseId: number) => {
    setPendingValue(null);
    await selectActiveCourse(courseId);
  };

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = Number(event.target.value);
    if (!Number.isInteger(value) || value <= 0) {
      return;
    }

    const switchingAway =
      activeCourse != null && activeCourse.localId !== value;
    const pendingWork =
      hasPendingAssistantWork?.() ??
      (typeof window !== "undefined" &&
        Boolean(
          document.querySelector(
            '[data-pending-action-status="pending"], [data-chat-loading="true"]',
          ),
        ));

    if (warnOnSwitch && switchingAway) {
      const detail = pendingWork
        ? "You have a pending assistant preview or an in-progress reply. Switching courses keeps the current conversation on the old course and starts (or resumes) a separate thread for the new course."
        : "Switching the active course will keep any open conversation scoped to its original course and open a new thread when you chat about the new course.";
      const confirmed = window.confirm(
        `${detail}\n\nSwitch active course anyway?`,
      );
      if (!confirmed) {
        // Reset the controlled select to the current active course.
        setPendingValue(activeCourse?.localId ?? null);
        event.target.value = activeCourse?.localId
          ? String(activeCourse.localId)
          : "";
        return;
      }
    }

    void applyCourse(value);
  };

  const selectValue =
    pendingValue != null
      ? String(pendingValue)
      : (activeCourse?.localId ?? "");

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
        value={selectValue}
        onChange={handleChange}
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
