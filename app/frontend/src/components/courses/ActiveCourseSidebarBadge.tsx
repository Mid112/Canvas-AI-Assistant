import { BookOpen } from "lucide-react";

import { useActiveCourse } from "@/contexts/useActiveCourse";

/** Persistent active-course indicator shown in the nav sidebar so the
 * selected course stays obvious while navigating away from the Courses
 * page or the assistant chat, not just on the pages that surface a course
 * switcher. Only mounted for the instructor role (see Sidebar.tsx), which
 * is the only role wrapped in ActiveCourseProvider. */
export function ActiveCourseSidebarBadge() {
  const { activeCourse, isLoading } = useActiveCourse();

  const label = activeCourse
    ? activeCourse.displayName
    : isLoading
      ? "Loading…"
      : "No active course";

  return (
    <div
      className="mx-3 mb-1 flex items-center gap-2 rounded-md bg-sidebar-accent/50 px-2.5 py-2"
      title={label}
    >
      <BookOpen
        className="size-4 shrink-0 text-sidebar-foreground/70"
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="truncate text-[0.65rem] font-medium uppercase tracking-wide text-sidebar-foreground/60">
          Active course
        </p>
        <p className="truncate text-sm font-semibold text-sidebar-foreground">
          {label}
        </p>
      </div>
    </div>
  );
}
