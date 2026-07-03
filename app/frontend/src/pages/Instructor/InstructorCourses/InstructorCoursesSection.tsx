import {
  BarChart3,
  BookOpen,
  ClipboardList,
  LayoutGrid,
  List,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { getCourseAnalyticsPath } from "@/pages/Instructor/InstructorSubmissionsAnalysis/submissionNavigation";
import {
  instructorCourseAssignmentsPath,
  instructorCourseStudentsPath,
} from "@/routes/paths";
import { cn } from "@/lib/utils";
import type { InstructorCourse } from "@/types/course";

interface InstructorCoursesCardProps {
  course: InstructorCourse;
  isActive: boolean;
  onSetActive: () => void;
  isSettingActive: boolean;
}

export function InstructorCoursesCard({
  course,
  isActive,
  onSetActive,
  isSettingActive,
}: InstructorCoursesCardProps) {
  return (
    <Card
      className={cn(
        "shadow-sm ring-1 ring-border/60",
        isActive && "ring-2 ring-primary",
      )}
    >
      <CardHeader className="space-y-3 border-b border-border/60 pb-4">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BookOpen className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold leading-snug">
                {course.code}: {course.name}
              </p>
              {isActive ? (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  Active
                </span>
              ) : null}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium tabular-nums text-primary">
                  {course.progress}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-primary/15">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${course.progress}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-2 pt-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-muted-foreground">
            <Users className="size-4" aria-hidden="true" />
            Students
          </span>
          <span className="font-medium tabular-nums">{course.studentCount}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-muted-foreground">
            <ClipboardList className="size-4" aria-hidden="true" />
            Assignments
          </span>
          <span className="font-medium tabular-nums">
            {course.assignmentCount}
          </span>
        </div>
        <p className="text-muted-foreground">
          Last activity: {course.lastActivity}
        </p>
      </CardContent>

      <CardFooter className="grid grid-cols-2 gap-2 border-t bg-transparent pt-4">
        <Link
          to={instructorCourseAssignmentsPath(course.id)}
          className={cn(buttonVariants(), "w-full")}
        >
          Assignments
        </Link>
        <Link
          to={instructorCourseStudentsPath(course.id)}
          className={cn(buttonVariants({ variant: "outline" }), "w-full")}
        >
          <Users data-icon="inline-start" />
          Students
        </Link>
        <Link
          to={getCourseAnalyticsPath(course.id)}
          className={cn(buttonVariants({ variant: "outline" }), "col-span-2 w-full")}
        >
          <BarChart3 data-icon="inline-start" />
          Analytics
        </Link>
        <Button
          type="button"
          variant={isActive ? "secondary" : "outline"}
          className="col-span-2 w-full"
          onClick={onSetActive}
          disabled={isActive || isSettingActive}
        >
          {isActive ? "Active Course" : "Set Active"}
        </Button>
      </CardFooter>
    </Card>
  );
}

interface InstructorCoursesListProps {
  courses: InstructorCourse[];
  activeCourseId: number | null;
  onSetActiveCourse: (courseId: number) => void;
  isSettingActiveCourse: boolean;
}

export function InstructorCoursesList({
  courses,
  activeCourseId,
  onSetActiveCourse,
  isSettingActiveCourse,
}: InstructorCoursesListProps) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <ul className="divide-y">
        {courses.map((course) => (
          <li
            key={course.id}
            className="flex flex-wrap items-center justify-between gap-4 px-4 py-4"
          >
            <div className="min-w-0 space-y-1">
              <p className="font-medium">
                {course.code}: {course.name}
                {activeCourseId === course.id ? (
                  <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    Active
                  </span>
                ) : null}
              </p>
              <p className="text-sm text-muted-foreground">
                {course.studentCount} students · {course.assignmentCount}{" "}
                assignments · Last activity: {course.lastActivity}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium tabular-nums">
                {course.progress}%
              </span>
              <Link
                to={getCourseAnalyticsPath(course.id)}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <BarChart3 data-icon="inline-start" />
                Analytics
              </Link>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onSetActiveCourse(course.id)}
                disabled={activeCourseId === course.id || isSettingActiveCourse}
              >
                {activeCourseId === course.id ? "Active" : "Set Active"}
              </Button>
              <Link
                to={instructorCourseStudentsPath(course.id)}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <Users data-icon="inline-start" />
                Students
              </Link>
              <Link
                to={instructorCourseAssignmentsPath(course.id)}
                className={buttonVariants({ size: "sm" })}
              >
                Assignments
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface InstructorCoursesSectionProps {
  courses: InstructorCourse[];
  viewMode: "grid" | "list";
  onViewModeChange: (mode: "grid" | "list") => void;
  activeCourseId: number | null;
  onSetActiveCourse: (courseId: number) => void;
  isSettingActiveCourse: boolean;
}

export function InstructorCoursesSection({
  courses,
  viewMode,
  onViewModeChange,
  activeCourseId,
  onSetActiveCourse,
  isSettingActiveCourse,
}: InstructorCoursesSectionProps) {
  return (
    <section aria-labelledby="your-courses-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id="your-courses-heading" className="text-lg font-semibold">
          Your Courses ({courses.length})
        </h2>
        <div className="flex items-center rounded-lg border border-primary/20 bg-primary/5 p-1">
          <Button
            type="button"
            variant={viewMode === "grid" ? "default" : "ghost"}
            size="sm"
            onClick={() => onViewModeChange("grid")}
            aria-pressed={viewMode === "grid"}
          >
            <LayoutGrid data-icon="inline-start" />
            Grid View
          </Button>
          <Button
            type="button"
            variant={viewMode === "list" ? "default" : "ghost"}
            size="sm"
            onClick={() => onViewModeChange("list")}
            aria-pressed={viewMode === "list"}
          >
            <List data-icon="inline-start" />
            List View
          </Button>
        </div>
      </div>

      {viewMode === "grid" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => (
            <InstructorCoursesCard
              key={course.id}
              course={course}
              isActive={activeCourseId === course.id}
              onSetActive={() => onSetActiveCourse(course.id)}
              isSettingActive={isSettingActiveCourse}
            />
          ))}
        </div>
      ) : (
        <InstructorCoursesList
          courses={courses}
          activeCourseId={activeCourseId}
          onSetActiveCourse={onSetActiveCourse}
          isSettingActiveCourse={isSettingActiveCourse}
        />
      )}
    </section>
  );
}

export function InstructorCoursesEmptyState({
  description = "Try adjusting your search or switch institutions.",
}: {
  description?: string;
}) {
  return (
    <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed p-12 text-center">
      <div className="space-y-1">
        <p className="font-medium">No courses found</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
