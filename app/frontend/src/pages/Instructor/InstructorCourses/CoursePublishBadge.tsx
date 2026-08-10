import { cn } from "@/lib/utils";
import type { InstructorCourse } from "@/types/course";

interface CoursePublishBadgeProps {
  course: InstructorCourse;
  className?: string;
}

function coursePublishLabel(course: InstructorCourse): string {
  if (!course.isPublished) {
    return "Unpublished";
  }
  if (!course.isWritable) {
    return "Completed";
  }
  return "Published";
}

export function CoursePublishBadge({
  course,
  className,
}: CoursePublishBadgeProps) {
  const label = coursePublishLabel(course);
  const tone = !course.isPublished
    ? "bg-amber-500/10 text-amber-900 ring-amber-500/25"
    : !course.isWritable
      ? "bg-muted text-muted-foreground ring-border/60"
      : "bg-emerald-500/10 text-emerald-800 ring-emerald-500/20";

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
