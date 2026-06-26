import { useEffect, useMemo, useState } from "react";

import { CanvasConnectionRequired } from "@/components/common/CanvasConnectionRequired";
import { useAuth } from "@/contexts/AuthContext";
import { useInstitution } from "@/contexts/useInstitution";
import { CanvasApiError, fetchCourses } from "@/services/canvas";
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
import type { CourseViewMode, InstructorCourse } from "@/types/course";
import type { CanvasCourse } from "@/types/canvas";

function mapCanvasCourseToInstructorCourse(course: CanvasCourse): InstructorCourse | null {
  if (course.local_id == null) {
    return null;
  }

  return {
    id: course.local_id,
    code: course.course_code,
    name: course.name,
    progress: 0,
    studentCount: course.total_students ?? 0,
    assignmentCount: 0,
    lastActivity: "Synced from Canvas",
  };
}

export function InstructorCoursesPage() {
  const { courses: mockCourses, analytics } = useInstitution();
  const { accessToken, user } = useAuth();
  const [canvasCourses, setCanvasCourses] = useState<InstructorCourse[]>([]);
  const [canvasError, setCanvasError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<CourseViewMode>("grid");

  useEffect(() => {
    if (!accessToken || !user?.has_canvas_token) {
      return;
    }

    const token = accessToken;
    let cancelled = false;

    async function loadCanvasCourses() {
      try {
        const data = await fetchCourses(token);
        if (cancelled) {
          return;
        }

        setCanvasCourses(
          data
            .map(mapCanvasCourseToInstructorCourse)
            .filter((course): course is InstructorCourse => course !== null),
        );
        setCanvasError(null);
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message =
          error instanceof CanvasApiError
            ? error.message
            : "Unable to load courses from Canvas.";
        setCanvasError(message);
        setCanvasCourses([]);
      }
    }

    void loadCanvasCourses();

    return () => {
      cancelled = true;
    };
  }, [accessToken, user?.has_canvas_token]);

  const courses = user?.has_canvas_token && canvasCourses.length > 0
    ? canvasCourses
    : mockCourses;

  const filteredCourses = useMemo(() => {
    const filtered = filterInstructorCourses(courses, search);
    return sortInstructorCourses(filtered);
  }, [courses, search]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
      <InstructorCoursesHeader />

      <InstructorCoursesSearch search={search} onSearchChange={setSearch} />

      {!user?.has_canvas_token ? (
        <CanvasConnectionRequired description="Connect Canvas to open course assignments and update them from this dashboard. You can still browse the sample course layout below." />
      ) : null}

      {user?.has_canvas_token && canvasError ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {canvasError} Showing sample course data instead.
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
        />
      )}
    </div>
  );
}
