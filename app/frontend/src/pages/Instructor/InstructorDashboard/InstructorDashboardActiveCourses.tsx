import { BookOpen } from "lucide-react";
import { Link } from "react-router-dom";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { instructorCourseAssignmentsPath } from "@/routes/paths";
import type { InstructorCourse } from "@/types/course";

import { dashboardColors, dashboardInteractive } from "./dashboardColors";

interface InstructorDashboardActiveCoursesProps {
  courses: InstructorCourse[];
}

export function InstructorDashboardActiveCourses({
  courses,
}: InstructorDashboardActiveCoursesProps) {
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
            {courses.map((course) => (
              <li
                key={course.id}
                className={cn(
                  "flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0",
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
                      {course.code}: {course.name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {course.studentCount} students · {course.assignmentCount}{" "}
                      assignments
                    </p>
                  </div>
                </div>
                <Link
                  to={instructorCourseAssignmentsPath(course.id)}
                  className={cn(
                    "shrink-0 rounded-md px-2 py-1 text-sm font-medium transition-colors duration-200",
                    dashboardColors.blue.link,
                    "hover:bg-blue-50",
                  )}
                >
                  View
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
