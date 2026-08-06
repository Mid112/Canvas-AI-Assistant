import {
  BookOpen,
  CheckCircle2,
  ClipboardList,
  HelpCircle,
  LayoutGrid,
  List,
  Loader2,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { CoursePublishBadge } from "@/pages/Instructor/InstructorCourses/CoursePublishBadge";
import {
  instructorCourseAssignmentsPath,
  instructorCoursePath,
  instructorCourseQuizzesPath,
} from "@/routes/paths";
import { formatInstructorCourseTitle } from "@/lib/format-course-title";
import { cn } from "@/lib/utils";
import type { InstructorCourse } from "@/types/course";

function coursePublishAction(course: InstructorCourse): {
  label: string;
  published: boolean;
} | null {
  // Completed courses are concluded on Canvas — publish state is frozen.
  if (course.isPublished && !course.isWritable) {
    return null;
  }
  if (!course.isPublished) {
    return { label: "Publish", published: true };
  }
  return { label: "Unpublish", published: false };
}

interface InstructorCoursesCardProps {
  course: InstructorCourse;
  isActive: boolean;
  onSetActive: () => void;
  isSettingActive: boolean;
  onTogglePublish: (published: boolean) => void;
  isTogglingPublish: boolean;
}

export function InstructorCoursesCard({
  course,
  isActive,
  onSetActive,
  isSettingActive,
  onTogglePublish,
  isTogglingPublish,
}: InstructorCoursesCardProps) {
  const isUnpublished = !course.isPublished;
  const publishAction = coursePublishAction(course);

  return (
    <Card
      className={cn(
        "shadow-sm ring-1 ring-border/60",
        isActive && "ring-2 ring-primary",
        isUnpublished && !isActive && "opacity-95",
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
                {formatInstructorCourseTitle(course)}
              </p>
              <CoursePublishBadge course={course} />
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
        <Link
          to={instructorCourseAssignmentsPath(course.id)}
          className="flex items-center justify-between rounded-md outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex items-center gap-2 text-muted-foreground">
            <ClipboardList className="size-4" aria-hidden="true" />
            Assignments
          </span>
          <span className="font-medium tabular-nums text-foreground">
            {course.assignmentCount}
          </span>
        </Link>
        <Link
          to={instructorCourseQuizzesPath(course.id)}
          className="flex items-center justify-between rounded-md outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex items-center gap-2 text-muted-foreground">
            <HelpCircle className="size-4" aria-hidden="true" />
            Quizzes
          </span>
          <span className="text-sm font-medium text-primary">Open</span>
        </Link>
        <p className="text-muted-foreground">
          Last activity: {course.lastActivity}
        </p>
      </CardContent>

      <CardFooter className="grid grid-cols-2 gap-2 border-t bg-transparent pt-4">
        <Link
          to={instructorCoursePath(course.id)}
          className={cn(buttonVariants(), "col-span-2 w-full")}
        >
          View Course
        </Link>
        {publishAction ? (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => onTogglePublish(publishAction.published)}
            disabled={isTogglingPublish}
            aria-busy={isTogglingPublish}
          >
            {isTogglingPublish ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Updating...
              </>
            ) : (
              publishAction.label
            )}
          </Button>
        ) : null}
        <Button
          type="button"
          variant={isActive ? "secondary" : "outline"}
          className={cn("w-full", !publishAction && "col-span-2")}
          onClick={onSetActive}
          disabled={isActive || isSettingActive || !course.isPublished}
          aria-busy={isSettingActive && !isActive}
          title={
            !course.isPublished
              ? "Unpublished courses can't be set as the active course"
              : course.isPublished && !course.isWritable
                ? "Completed courses can't be published or unpublished"
                : undefined
          }
        >
          {isSettingActive ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Setting active...
            </>
          ) : isActive ? (
            <>
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Active Course
            </>
          ) : (
            "Set Active"
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}

interface InstructorCoursesListProps {
  courses: InstructorCourse[];
  activeCourseId: number | null;
  onSetActiveCourse: (courseId: number) => void;
  settingActiveCourseId: number | null;
  onTogglePublish: (courseId: number, published: boolean) => void;
  togglingPublishCourseId: number | null;
}

export function InstructorCoursesList({
  courses,
  activeCourseId,
  onSetActiveCourse,
  settingActiveCourseId,
  onTogglePublish,
  togglingPublishCourseId,
}: InstructorCoursesListProps) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <ul className="divide-y">
        {courses.map((course) => {
          const publishAction = coursePublishAction(course);
          const isTogglingPublish = togglingPublishCourseId === course.id;
          return (
            <li
              key={course.id}
              className="flex flex-wrap items-center justify-between gap-4 px-4 py-4"
            >
              <div className="min-w-0 space-y-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  <span>{formatInstructorCourseTitle(course)}</span>
                  <CoursePublishBadge course={course} />
                  {activeCourseId === course.id ? (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      Active
                    </span>
                  ) : null}
                </p>
                <p className="text-sm text-muted-foreground">
                  {course.studentCount} students · {course.assignmentCount}{" "}
                  assignments · Last activity: {course.lastActivity}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium tabular-nums">
                  {course.progress}%
                </span>
                <Link
                  to={instructorCourseAssignmentsPath(course.id)}
                  className={buttonVariants({ size: "sm", variant: "outline" })}
                >
                  Assignments
                </Link>
                <Link
                  to={instructorCourseQuizzesPath(course.id)}
                  className={buttonVariants({ size: "sm", variant: "outline" })}
                >
                  Quizzes
                </Link>
                <Link
                  to={instructorCoursePath(course.id)}
                  className={buttonVariants({ size: "sm" })}
                >
                  View Course
                </Link>
                {publishAction ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      onTogglePublish(course.id, publishAction.published)
                    }
                    disabled={isTogglingPublish}
                    aria-busy={isTogglingPublish}
                  >
                    {isTogglingPublish ? (
                      <>
                        <Loader2
                          className="size-4 animate-spin"
                          aria-hidden="true"
                        />
                        Updating...
                      </>
                    ) : (
                      publishAction.label
                    )}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant={activeCourseId === course.id ? "secondary" : "outline"}
                  onClick={() => onSetActiveCourse(course.id)}
                  disabled={
                    activeCourseId === course.id ||
                    settingActiveCourseId !== null ||
                    !course.isPublished
                  }
                  aria-busy={settingActiveCourseId === course.id}
                  title={
                    !course.isPublished
                      ? "Unpublished courses can't be set as the active course"
                      : undefined
                  }
                >
                  {settingActiveCourseId === course.id ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      Setting...
                    </>
                  ) : activeCourseId === course.id ? (
                    <>
                      <CheckCircle2 className="size-4" aria-hidden="true" />
                      Active
                    </>
                  ) : (
                    "Set Active"
                  )}
                </Button>
              </div>
            </li>
          );
        })}
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
  settingActiveCourseId: number | null;
  onTogglePublish: (courseId: number, published: boolean) => void;
  togglingPublishCourseId: number | null;
}

export function InstructorCoursesSection({
  courses,
  viewMode,
  onViewModeChange,
  activeCourseId,
  onSetActiveCourse,
  settingActiveCourseId,
  onTogglePublish,
  togglingPublishCourseId,
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
              isSettingActive={settingActiveCourseId === course.id}
              onTogglePublish={(published) =>
                onTogglePublish(course.id, published)
              }
              isTogglingPublish={togglingPublishCourseId === course.id}
            />
          ))}
        </div>
      ) : (
        <InstructorCoursesList
          courses={courses}
          activeCourseId={activeCourseId}
          onSetActiveCourse={onSetActiveCourse}
          settingActiveCourseId={settingActiveCourseId}
          onTogglePublish={onTogglePublish}
          togglingPublishCourseId={togglingPublishCourseId}
        />
      )}
    </section>
  );
}

export function InstructorCoursesEmptyState({
  description = "Try adjusting your search.",
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
