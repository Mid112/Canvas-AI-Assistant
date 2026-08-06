// Instructor page note: coordinates instructor course layout UI state with Canvas-backed services and active-course context.

import { useMemo } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Link, Outlet, useParams } from "react-router-dom";

import { CanvasConnectionRequired } from "@/components/common/CanvasConnectionRequired";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useCourseAssignmentCount } from "@/hooks/useCourseAssignmentCount";
import { useResolvedInstructorCourse } from "@/hooks/useResolvedInstructorCourse";
import { InstructorCourseHeader } from "@/pages/Instructor/InstructorCourse/InstructorCourseHeader";
import { InstructorCourseTabs } from "@/pages/Instructor/InstructorCourse/InstructorCourseTabs";
import type { InstructorCourseOutletContext } from "@/pages/Instructor/InstructorCourse/instructorCourseLayoutContext";
import { paths } from "@/routes/paths";
import { pageShell } from "@/lib/page-shell";

export function InstructorCourseLayout() {
  const { localCourseId } = useParams();
  const { user } = useAuth();
  const parsedLocalCourseId = Number(localCourseId);
  const idIsValid =
    Number.isInteger(parsedLocalCourseId) && parsedLocalCourseId > 0;

  const courseResolution = useResolvedInstructorCourse(
    idIsValid ? parsedLocalCourseId : 0,
  );
  const assignmentCount = useCourseAssignmentCount(
    parsedLocalCourseId,
    courseResolution.canvasUrl,
    idIsValid && Boolean(courseResolution.course),
  );

  const courseWithCounts = useMemo(() => {
    if (!courseResolution.course) {
      return null;
    }

    if (assignmentCount == null) {
      return courseResolution.course;
    }

    return {
      ...courseResolution.course,
      assignmentCount,
    };
  }, [assignmentCount, courseResolution.course]);

  if (!idIsValid) {
    return (
      <PageState
        title="Invalid course link"
        message="The course ID in this URL is not valid."
        action={
          <Button variant="outline" render={<Link to={paths.instructor.courses} />}>
            Back to courses
          </Button>
        }
      />
    );
  }

  if (!user?.has_canvas_token || courseResolution.needsCanvasConnection) {
    return (
      <div className={pageShell}>
        <CanvasConnectionRequired description="Connect Canvas to view this course." />
      </div>
    );
  }

  if (courseResolution.isLoading) {
    return (
      <PageState
        title="Loading course"
        message="Fetching course details from Canvas..."
        icon={<Loader2 className="size-5 animate-spin text-primary" aria-hidden="true" />}
      />
    );
  }

  if (courseResolution.loadError) {
    return (
      <PageState
        title="Unable to load course"
        message={courseResolution.loadError}
        icon={<AlertCircle className="size-5 text-destructive" aria-hidden="true" />}
        action={
          <Button variant="outline" render={<Link to={paths.instructor.courses} />}>
            Back to courses
          </Button>
        }
      />
    );
  }

  if (!courseWithCounts) {
    return (
      <PageState
        title="Course not found"
        message="This course is not available in your synced Canvas courses."
        action={
          <Button variant="outline" render={<Link to={paths.instructor.courses} />}>
            Back to courses
          </Button>
        }
      />
    );
  }

  const outletContext: InstructorCourseOutletContext = {
    localCourseId: parsedLocalCourseId,
    embedded: true,
    ...courseResolution,
    course: courseWithCounts,
  };

  return (
    <div className={pageShell}>
      <InstructorCourseHeader
        localCourseId={parsedLocalCourseId}
        course={courseWithCounts}
      />
      <InstructorCourseTabs localCourseId={parsedLocalCourseId} />
      <Outlet context={outletContext} />
    </div>
  );
}

function PageState({
  title,
  message,
  icon,
  action,
}: {
  title: string;
  message: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className={pageShell}>
      <Card className="max-w-2xl shadow-sm ring-1 ring-border/60">
        <CardContent className="flex flex-col items-start gap-4 p-6">
          <div className="flex items-center gap-3">
            {icon}
            <div className="space-y-1">
              <h1 className="text-xl font-semibold">{title}</h1>
              <p className="text-sm text-muted-foreground">{message}</p>
            </div>
          </div>
          {action}
        </CardContent>
      </Card>
    </div>
  );
}
