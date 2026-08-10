import { BookOpen, CheckCircle2, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useActiveCourse } from "@/contexts/useActiveCourse";
import { formatInstructorCourseTitle } from "@/lib/format-course-title";
import { cn } from "@/lib/utils";
import { instructorCoursePath } from "@/routes/paths";
import type { InstructorCourse } from "@/types/course";

import { dashboardColors, dashboardInteractive } from "./dashboardColors";

interface InstructorDashboardActiveCoursesProps {
  courses: InstructorCourse[];
}

export function InstructorDashboardActiveCourses({
  courses,
}: InstructorDashboardActiveCoursesProps) {
  // Reads the context directly rather than taking props, matching
  // ActiveCourseSelector: both are self-contained widgets that happen to sit
  // on a page with no other reason to track the active course. (The Courses
  // page passes props instead only because it already owns that state for its
  // publish toggles.)
  const { activeCourse, isSaving, selectActiveCourse } = useActiveCourse();

  return (
    <Card className="shadow-sm ring-1 ring-border/60">
      <CardHeader>
        <CardTitle>Active Courses</CardTitle>
      </CardHeader>
      <CardContent>
        {courses.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No Canvas courses to display yet.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {courses.map((course) => {
              const isActive = activeCourse?.localId === course.id;
              return (
              <li
                key={course.id}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0",
                  dashboardInteractive.listRow,
                  "-mx-2 px-2",
                )}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center",
                      dashboardColors.blue.iconSquare,
                    )}
                  >
                    <BookOpen className="size-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    <p className="truncate text-sm font-medium">
                      {formatInstructorCourseTitle(course)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {course.studentCount} students · {course.assignmentCount}{" "}
                      assignments
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {/* Same rule as ActiveCourseSelector: an unpublished course
                      is a draft and cannot be the active one, so the button is
                      offered but explains itself rather than silently failing. */}
                  <Button
                    type="button"
                    size="sm"
                    variant={isActive ? "secondary" : "outline"}
                    onClick={() => void selectActiveCourse(course.id, course)}
                    disabled={isActive || isSaving || !course.isPublished}
                    aria-busy={isSaving && !isActive}
                    title={
                      !course.isPublished
                        ? "Unpublished courses can't be set as the active course"
                        : undefined
                    }
                  >
                    {isSaving && !isActive ? (
                      <>
                        <Loader2
                          className="size-4 animate-spin"
                          aria-hidden="true"
                        />
                        Setting...
                      </>
                    ) : isActive ? (
                      <>
                        <CheckCircle2 className="size-4" aria-hidden="true" />
                        Active
                      </>
                    ) : (
                      "Set Active"
                    )}
                  </Button>
                  <Link
                    to={instructorCoursePath(course.id)}
                    className={cn(
                      "rounded-md px-2 py-1 text-sm font-medium transition-colors duration-200",
                      dashboardColors.blue.link,
                      "hover:bg-primary/10",
                    )}
                  >
                    View
                  </Link>
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
