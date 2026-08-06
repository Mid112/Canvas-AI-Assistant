// Instructor page note: coordinates instructor course overview page UI state with Canvas-backed services and active-course context.

import { AlertCircle, Loader2 } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { useCourseOverview } from "@/hooks/useCourseOverview";
import { useInstructorCourseOutletContext } from "@/hooks/useInstructorCourseOutletContext";
import { InstructorCourseOverviewMetrics } from "@/pages/Instructor/InstructorCourse/InstructorCourseOverviewMetrics";
import { RecentAssignmentsCard } from "@/pages/Instructor/InstructorCourse/RecentAssignmentsCard";
import { StudentActivityCard } from "@/pages/Instructor/InstructorCourse/StudentActivityCard";

export function InstructorCourseOverviewPage() {
  const layoutContext = useInstructorCourseOutletContext();
  const localCourseId = layoutContext?.localCourseId ?? 0;
  const course = layoutContext?.course ?? null;
  const canvasUrl = layoutContext?.canvasUrl;

  const { overview, isLoading, loadError } = useCourseOverview(
    localCourseId,
    canvasUrl,
    Boolean(layoutContext && course),
  );

  if (!layoutContext || !course) {
    return null;
  }

  if (isLoading) {
    return (
      <Card className="shadow-sm ring-1 ring-border/60">
        <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
          Loading course overview...
        </CardContent>
      </Card>
    );
  }

  if (loadError) {
    return (
      <Card className="shadow-sm ring-1 ring-border/60">
        <CardContent className="flex items-start gap-3 p-6 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>{loadError}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <InstructorCourseOverviewMetrics course={course} overview={overview} />
      <div className="grid gap-6 xl:grid-cols-2">
        <RecentAssignmentsCard
          localCourseId={localCourseId}
          assignments={overview?.recentAssignments ?? []}
          totalStudents={course.studentCount}
        />
        <StudentActivityCard
          localCourseId={localCourseId}
          activity={overview?.recentActivity ?? []}
        />
      </div>
    </div>
  );
}
