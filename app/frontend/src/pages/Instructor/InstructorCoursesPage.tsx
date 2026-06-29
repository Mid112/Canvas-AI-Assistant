import { useMemo, useState } from "react";

import { CanvasConnectionRequired } from "@/components/common/CanvasConnectionRequired";
import { useAuth } from "@/contexts/AuthContext";
import {
  filterInstructorCourses,
  sortInstructorCourses,
} from "@/pages/Instructor/InstructorCourses/courseUtils";
import { InstructorCoursesHeader } from "@/pages/Instructor/InstructorCourses/InstructorCoursesHeader";
import { InstructorCoursesSearch } from "@/pages/Instructor/InstructorCourses/InstructorCoursesSearch";
import {
  InstructorCoursesEmptyState,
  InstructorCoursesSection,
} from "@/pages/Instructor/InstructorCourses/InstructorCoursesSection";
import { useCanvasInstructorCourses } from "@/pages/Instructor/InstructorCourses/useCanvasInstructorCourses";
import type { CourseViewMode } from "@/types/course";

export function InstructorCoursesPage() {
  const { user } = useAuth();
  const { courses, error, isLoaded, isLoading, reloadCourses } =
    useCanvasInstructorCourses();
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<CourseViewMode>("grid");

  const filteredCourses = useMemo(() => {
    const filtered = filterInstructorCourses(courses, search);
    return sortInstructorCourses(filtered);
  }, [courses, search]);

  // No mock fallback — show connect prompt only when Canvas is not linked.
  if (!user?.has_canvas_token) {
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

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading courses from Canvas...</p>
      ) : isLoaded && !error && courses.length === 0 ? (
        <p
          role="status"
          className="rounded-lg border border-border/60 bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground"
        >
          No courses found in Canvas. Courses you teach will appear here once they
          are available in your Canvas account.
        </p>
      ) : filteredCourses.length === 0 ? (
        // Search returned no matches but Canvas still has courses.
        <InstructorCoursesEmptyState />
      ) : (
        <InstructorCoursesSection
          courses={filteredCourses}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      )}
    </div>
  );
}
