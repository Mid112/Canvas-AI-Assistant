import { Loader2 } from "lucide-react";

import { CanvasConnectionRequired } from "@/components/common/CanvasConnectionRequired";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useInstitution } from "@/contexts/useInstitution";
import { InstructorDashboardActiveCourses } from "@/pages/Instructor/InstructorDashboard/InstructorDashboardActiveCourses";
import { InstructorDashboardHeader } from "@/pages/Instructor/InstructorDashboard/InstructorDashboardHeader";
import { InstructorDashboardOverview } from "@/pages/Instructor/InstructorDashboard/InstructorDashboardOverview";
import { InstructorDashboardQuickActions } from "@/pages/Instructor/InstructorDashboard/InstructorDashboardQuickActions";
import { useCanvasInstructorCourses } from "@/pages/Instructor/InstructorCourses/useCanvasInstructorCourses";
import type { DashboardMetrics } from "@/types/dashboard";
import { sharedDashboardQuickActions } from "@/types/dashboard";
import type { InstructorCourse } from "@/types/course";

function deriveDashboardMetrics(courses: InstructorCourse[]): DashboardMetrics {
  return {
    activeCourses: courses.length,
    activeCoursesTrend: 0,
    totalStudents: courses.reduce((sum, course) => sum + course.studentCount, 0),
    totalStudentsTrend: 0,
    missingSubmissions: 0,
    missingSubmissionsTrend: 0,
    pendingApprovals: 0,
  };
}

export function InstructorDashboardPage() {
  const { user } = useAuth();
  const { selectedInstitution } = useInstitution();
  const {
    courses,
    error,
    isLoading,
    isLoaded,
    needsCanvasConnection,
  } = useCanvasInstructorCourses();

  if (!user?.has_canvas_token || needsCanvasConnection) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
        <InstructorDashboardHeader
          userName={user?.name ?? "Instructor"}
          institutionShortName={selectedInstitution.shortName}
        />
        <CanvasConnectionRequired description="Connect Canvas to view course metrics, activity, and notifications from your institution." />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
      <InstructorDashboardHeader
        userName={user?.name ?? "Instructor"}
        institutionShortName={selectedInstitution.shortName}
      />

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {isLoading ? (
        <Card className="shadow-sm ring-1 ring-border/60">
          <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
            Loading dashboard data from Canvas...
          </CardContent>
        </Card>
      ) : (
        <>
          <InstructorDashboardOverview
            metrics={deriveDashboardMetrics(courses)}
          />

          <div className="grid gap-6 lg:grid-cols-2">
            <InstructorDashboardQuickActions
              actions={sharedDashboardQuickActions}
            />
            <InstructorDashboardActiveCourses courses={courses} />
          </div>

          {isLoaded && courses.length === 0 && !error ? (
            <p
              role="status"
              className="rounded-lg border border-border/60 bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground"
            >
              No Canvas courses found yet. Courses you teach will appear here once
              they are available in your Canvas account.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
