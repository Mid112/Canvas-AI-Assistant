import { useMemo, useState } from "react";

import { CanvasConnectionRequired } from "@/components/common/CanvasConnectionRequired";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveCourse } from "@/contexts/useActiveCourse";
import { useInstitution } from "@/contexts/useInstitution";
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
import type { CourseViewMode } from "@/types/course";

export function InstructorCoursesPage() {
  const { analytics } = useInstitution();
  const { user } = useAuth();
  const {
    activeCourse,
    availableCourses,
    error: activeCourseError,
    isLoading,
    isSaving,
    selectActiveCourse,
  } = useActiveCourse();
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<CourseViewMode>("grid");

  const courses = availableCourses;

  const filteredCourses = useMemo(() => {
    const filtered = filterInstructorCourses(courses, search);
    return sortInstructorCourses(filtered);
  }, [courses, search]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
      <InstructorCoursesHeader />

      <InstructorCoursesSearch search={search} onSearchChange={setSearch} />

      {!user?.has_canvas_token ? (
        <CanvasConnectionRequired description="Connect Canvas to sync your course list from Canvas. You can still browse the sample course layout below and choose an active course locally." />
      ) : null}

      {user?.has_canvas_token && activeCourseError ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {activeCourseError} Showing sample course data instead.
        </p>
      ) : null}

      {user?.has_canvas_token && isLoading ? (
        <p className="text-sm text-muted-foreground">Syncing courses from Canvas...</p>
      ) : null}

      {activeCourse ? (
        <p className="text-sm text-muted-foreground">
          Active course:{" "}
          <span className="font-medium text-foreground">
            {activeCourse.displayName}
          </span>
        </p>
      ) : null}

      <InstructorCoursesOverview analytics={analytics} />

      {filteredCourses.length === 0 ? (
        <InstructorCoursesEmptyState />
      ) : (
        <InstructorCoursesSection
          courses={filteredCourses}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          activeCourseId={activeCourse?.localId ?? null}
          onSetActiveCourse={(courseId) => void selectActiveCourse(courseId)}
          isSettingActiveCourse={isSaving}
        />
      )}
    </div>
  );
}
