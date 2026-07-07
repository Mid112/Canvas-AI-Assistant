import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";

import { CanvasConnectionRequired } from "@/components/common/CanvasConnectionRequired";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveCourse } from "@/contexts/useActiveCourse";
import {
  filterInstructorCourses,
  sortInstructorCourses,
} from "@/pages/Instructor/InstructorCourses/courseUtils";
import { InstructorCoursesHeader } from "@/pages/Instructor/InstructorCourses/InstructorCoursesHeader";
import { InstructorCoursesOverview } from "@/pages/Instructor/InstructorCourses/InstructorCoursesOverview";
import { InstructorCoursesSearch } from "@/pages/Instructor/InstructorCourses/InstructorCoursesSearch";
import {
  InstructorCoursesEmptyState,
  InstructorCoursesSection,
} from "@/pages/Instructor/InstructorCourses/InstructorCoursesSection";
import { useCanvasInstructorCourses } from "@/pages/Instructor/InstructorCourses/useCanvasInstructorCourses";
import type { CourseViewMode } from "@/types/course";

export function InstructorCoursesPage() {
  const { user } = useAuth();
  const {
    activeCourse,
    error: activeCourseError,
    isSaving,
    selectActiveCourse,
  } = useActiveCourse();
  const {
    courses,
    error,
    isLoaded,
    isLoading,
    needsCanvasConnection,
    reloadCourses,
  } = useCanvasInstructorCourses();
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<CourseViewMode>("grid");
  const [settingActiveCourseId, setSettingActiveCourseId] = useState<number | null>(
    null,
  );

  const filteredCourses = useMemo(() => {
    const filtered = filterInstructorCourses(courses, search);
    return sortInstructorCourses(filtered);
  }, [courses, search]);

  const handleSetActiveCourse = async (courseId: number) => {
    setSettingActiveCourseId(courseId);
    try {
      await selectActiveCourse(courseId);
    } finally {
      setSettingActiveCourseId(null);
    }
  };

  if (!user?.has_canvas_token || needsCanvasConnection) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
        <InstructorCoursesHeader />
        <CanvasConnectionRequired description="Connect Canvas to view your courses, assignments, and submission analytics." />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
      <InstructorCoursesHeader
        onRefreshCourses={reloadCourses}
        isRefreshing={isLoading}
      />

      <InstructorCoursesSearch search={search} onSearchChange={setSearch} />

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      {activeCourseError ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {activeCourseError}
        </p>
      ) : null}

      {activeCourse ? (
        <p className="text-sm text-muted-foreground">
          Active course:{" "}
          <span className="font-medium text-foreground">
            {activeCourse.displayName}
          </span>
        </p>
      ) : null}

      <InstructorCoursesOverview courses={courses} />

      {isLoading ? (
        <Card className="shadow-sm ring-1 ring-border/60">
          <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
            Loading courses from Canvas...
          </CardContent>
        </Card>
      ) : isLoaded && !error && courses.length === 0 ? (
        <p
          role="status"
          className="rounded-lg border border-border/60 bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground"
        >
          No courses found in Canvas. Courses you teach will appear here once they
          are available in your Canvas account.
        </p>
      ) : filteredCourses.length === 0 ? (
        <InstructorCoursesEmptyState description="No Canvas courses matched this search." />
      ) : (
        <InstructorCoursesSection
          courses={filteredCourses}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          activeCourseId={activeCourse?.localId ?? null}
          onSetActiveCourse={(courseId) => void handleSetActiveCourse(courseId)}
          settingActiveCourseId={isSaving ? settingActiveCourseId : null}
        />
      )}
    </div>
  );
}
