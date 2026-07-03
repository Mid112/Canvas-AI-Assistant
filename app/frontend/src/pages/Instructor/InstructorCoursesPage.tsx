import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { CanvasConnectionRequired } from "@/components/common/CanvasConnectionRequired";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useInstitution } from "@/contexts/useInstitution";
import { getPrimaryCanvasConnectionUrl } from "@/lib/canvas-connections";
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
  // The backend creates/persists local courses while syncing Canvas courses.
  // Skip any Canvas item that could not be matched to a local course record.
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
  const [isLoadingCanvasCourses, setIsLoadingCanvasCourses] = useState(false);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<CourseViewMode>("grid");
  const canvasUrl = getPrimaryCanvasConnectionUrl(user);

  useEffect(() => {
    if (!accessToken || !user?.has_canvas_token) {
      return;
    }

    const token = accessToken;
    // Use the saved connection URL so local Canvas Docker and production Canvas
    // tokens are never accidentally sent to the wrong Canvas host.
    const selectedCanvasUrl = canvasUrl;
    let cancelled = false;

    async function loadCanvasCourses() {
      setIsLoadingCanvasCourses(true);

      try {
        const data = await fetchCourses(token, selectedCanvasUrl);
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
      } finally {
        if (!cancelled) {
          setIsLoadingCanvasCourses(false);
        }
      }
    }

    void loadCanvasCourses();

    return () => {
      cancelled = true;
    };
  }, [accessToken, canvasUrl, user?.has_canvas_token]);

  // Once Canvas is connected, treat Canvas as the source of truth. Mock courses
  // are only shown before connection so missing real data is visible to devs.
  const courses = user?.has_canvas_token ? canvasCourses : mockCourses;

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
          {canvasError}
        </p>
      ) : null}

      <InstructorCoursesOverview analytics={analytics} />

      {user?.has_canvas_token && isLoadingCanvasCourses ? (
        <Card className="shadow-sm ring-1 ring-border/60">
          <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
            Loading courses from Canvas...
          </CardContent>
        </Card>
      ) : filteredCourses.length === 0 ? (
        <InstructorCoursesEmptyState
          description={
            user?.has_canvas_token
              ? "No Canvas courses matched this search."
              : "Try adjusting your search or switch institutions."
          }
        />
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
