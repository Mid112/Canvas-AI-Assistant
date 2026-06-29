import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { useInstitution } from "@/contexts/useInstitution";
import { getInstitutionCanvasUrl } from "@/lib/institution-canvas";
import { fetchCourseAssignments } from "@/services/assignments";
import { CanvasApiError, fetchCourses } from "@/services/canvas";
import type { InstructorCourse } from "@/types/course";

import { mapCanvasCourseToInstructorCourse } from "./mapCanvasCourse";

/**
 * Loads instructor courses from Canvas for the selected institution.
 * Assignment counts are fetched per course using Canvas course IDs (see assignments.ts).
 */
export function useCanvasInstructorCourses() {
  const { accessToken, user, logout } = useAuth();
  const { selectedInstitution } = useInstitution();
  const [courses, setCourses] = useState<InstructorCourse[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const hasCanvasToken = Boolean(accessToken && user?.has_canvas_token);
  const canvasUrl = getInstitutionCanvasUrl(selectedInstitution.id);

  // Bumps reloadToken to re-run the effect after "Sync from Canvas" or institution switch.
  const reloadCourses = useCallback(() => {
    if (!hasCanvasToken) {
      return;
    }

    setReloadToken((count) => count + 1);
  }, [hasCanvasToken]);

  useEffect(() => {
    if (!hasCanvasToken || !accessToken) {
      return;
    }

    const token = accessToken;
    let cancelled = false;

    async function loadCanvasCourses() {
      setIsLoaded(false);
      setError(null);

      try {
        const data = await fetchCourses(token, canvasUrl);
        if (cancelled) {
          return;
        }

        const baseCourses = data
          .map((course) => mapCanvasCourseToInstructorCourse(course, canvasUrl))
          .filter((course): course is InstructorCourse => course !== null);

        const coursesWithCounts = await Promise.all(
          baseCourses.map(async (course) => {
            if (course.canvasCourseId == null || course.canvasUrl == null) {
              return course;
            }

            try {
              // Backend expects Canvas course ID + canvas_url, not the local DB id in routes.
              const assignments = await fetchCourseAssignments(
                course.canvasCourseId,
                token,
                course.canvasUrl,
              );
              return { ...course, assignmentCount: assignments.length };
            } catch {
              // Keep the course visible even if assignment count fails for one card.
              return course;
            }
          }),
        );

        if (!cancelled) {
          setCourses(coursesWithCounts);
        }
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        if (loadError instanceof CanvasApiError && loadError.status === 401) {
          // Session or Canvas token is no longer valid.
          logout();
          return;
        }

        const message =
          loadError instanceof CanvasApiError
            ? loadError.message
            : "Unable to load courses from Canvas.";
        setError(message);
        setCourses([]);
      } finally {
        if (!cancelled) {
          setIsLoaded(true);
        }
      }
    }

    void loadCanvasCourses();

    return () => {
      cancelled = true;
    };
  }, [accessToken, canvasUrl, hasCanvasToken, logout, reloadToken, selectedInstitution.id]);

  return {
    courses,
    error,
    hasCanvasToken,
    isLoaded,
    isLoading: hasCanvasToken && !isLoaded && !error,
    reloadCourses,
  };
}
