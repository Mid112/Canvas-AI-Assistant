import { useMemo, type ChangeEvent } from "react";
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
  /** Return true when chat has a pending preview or an in-progress reply. */
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

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = Number(event.target.value);
    if (!Number.isInteger(value) || value <= 0) {
      return;
    }

    const switchingAway =
      activeCourse != null && activeCourse.localId !== value;
    const pendingWork = Boolean(hasPendingAssistantWork?.());

    // Only the pending-work case still prompts. The plain "your conversation
    // stays on the old course" notice fired on every switch to explain routing
    // the instructor did not ask about, and chat tabs will show that routing
    // directly instead of describing it in a modal.
    //
    // The pending-work prompt stays until those tabs land: switching course
    // re-keys ChatWindow (see the course-context sync in
    // InstructorAssistantPage), so an unconfirmed preview disappears from
    // view. Tabs replace this by opening the new course in a background tab
    // and leaving the instructor on the one holding their preview.
    if (warnOnSwitch && switchingAway && pendingWork) {
      const confirmed = window.confirm(
        "You have a pending assistant preview or an in-progress reply. " +
          "Switching courses keeps the current conversation on the old course " +
          "and starts (or resumes) a separate thread for the new course." +
          "\n\nSwitch active course anyway?",
      );
      if (!confirmed) {
        // Controlled select already binds to activeCourse; force a reset so
        // the cancelled option does not stick visually.
        event.target.value = activeCourse?.localId
          ? String(activeCourse.localId)
          : "";
        return;
      }
    }

    void selectActiveCourse(value);
  };

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
