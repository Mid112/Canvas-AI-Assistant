// Instructor page note: coordinates instructor course header UI state with Canvas-backed services and active-course context.

import { ArrowLeft, BookOpen } from "lucide-react";
import { Link } from "react-router-dom";

import { buttonVariants } from "@/components/ui/button";
import { useActiveCourse } from "@/contexts/useActiveCourse";
import { formatInstructorCourseTitle } from "@/lib/format-course-title";
import { cn } from "@/lib/utils";
import { paths } from "@/routes/paths";
import type { InstructorCourse } from "@/types/course";

interface InstructorCourseHeaderProps {
  localCourseId: number;
  course: InstructorCourse;
  studentCount?: number;
  assignmentCount?: number;
}

export function InstructorCourseHeader({
  localCourseId,
  course,
  studentCount = course.studentCount,
  assignmentCount = course.assignmentCount,
}: InstructorCourseHeaderProps) {
  const { activeCourse } = useActiveCourse();
  const isActive = activeCourse?.localId === localCourseId;
  const courseTitle = formatInstructorCourseTitle(course);

  return (
    <header className="space-y-4">
      <Link
        to={paths.instructor.courses}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "-ml-2 w-fit text-muted-foreground hover:text-foreground",
        )}
      >
        <ArrowLeft data-icon="inline-start" />
        Back to Courses
      </Link>

      <div className="flex min-w-0 items-start gap-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <BookOpen className="size-6" aria-hidden="true" />
        </div>
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            {courseTitle}
          </h1>
          <p className="text-sm text-muted-foreground">Synced from Canvas</p>
          <p className="text-sm text-muted-foreground">
            {studentCount} Students · {assignmentCount} Assignments
            {isActive ? (
              <>
                {" "}
                · <span className="font-medium text-emerald-600">Active</span>
              </>
            ) : null}
          </p>
        </div>
      </div>

      <p className="sr-only" id={`course-${localCourseId}-title`}>
        {courseTitle}
      </p>
    </header>
  );
}
