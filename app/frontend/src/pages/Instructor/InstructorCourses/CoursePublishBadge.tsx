import { cn } from "@/lib/utils";
import { coursePublishLabel } from "@/pages/Instructor/InstructorCourses/courseUtils";
import type { InstructorCourse } from "@/types/course";

interface CoursePublishBadgeProps {
  course: InstructorCourse;
  className?: string;
}

export function CoursePublishBadge({
  course,
  className,
}: CoursePublishBadgeProps) {
  if (!course.workflowState) {
    return null;
  }

  const label = coursePublishLabel(course);
  const tone =
    course.workflowState === "available"
      ? "bg-emerald-500/10 text-emerald-800 ring-emerald-500/20"
      : course.workflowState === "unpublished"
        ? "bg-amber-500/10 text-amber-900 ring-amber-500/25"
        : "bg-muted text-muted-foreground ring-border/60";

  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        tone,
        className,
      )}
      title={`Canvas status: ${label}`}
    >
      {label}
    </span>
  );
}
