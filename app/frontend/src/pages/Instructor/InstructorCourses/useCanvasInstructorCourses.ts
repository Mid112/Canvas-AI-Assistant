import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { useCanvasConnectionUrl } from "@/hooks/useCanvasConnectionUrl";
import { isCanvasConnectionRequiredError } from "@/lib/canvas-connection";
import { fetchCourseAssignments } from "@/services/assignments";
import { CanvasApiError, fetchCourses } from "@/services/canvas";
import type { InstructorCourse } from "@/types/course";

import { mapCanvasCourseToInstructorCourse } from "./mapCanvasCourse";

const ASSIGNMENT_COUNT_CONCURRENCY = 3;

async function loadAssignmentCounts(
  courses: InstructorCourse[],
  token: string,
  canvasUrl: string,
): Promise<InstructorCourse[]> {
  const results = courses.map((course) => ({ ...course }));
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < results.length) {
      const index = nextIndex++;
      const course = results[index]!;

      try {
        const assignments = await fetchCourseAssignments(
          course.id,
          token,
          canvasUrl,
        );
        results[index] = { ...course, assignmentCount: assignments.length };
      } catch {
        // Keep the course visible even if assignment count fails for one card.
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(ASSIGNMENT_COUNT_CONCURRENCY, results.length) },
      () => worker(),
    ),
  );

  return results;
}

/**
 * Loads instructor courses from Canvas for the selected institution.
 * Assignment counts are fetched in the background with limited concurrency.
 */
export function useCanvasInstructorCourses() {
  const { accessToken, user, logout } = useAuth();
  const canvasUrl = useCanvasConnectionUrl();
  const [courses, setCourses] = useState<InstructorCourse[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsCanvasConnection, setNeedsCanvasConnection] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const hasCanvasToken = Boolean(accessToken && user?.has_canvas_token);

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
      if (!canvasUrl) {
        setNeedsCanvasConnection(true);
        setCourses([]);
        setIsLoaded(true);
        return;
      }

      setIsLoaded(false);
      setError(null);
      setNeedsCanvasConnection(false);

      try {
        const data = await fetchCourses(token, canvasUrl);
        if (cancelled) {
          return;
        }

        const baseCourses = data
          .map((course) => mapCanvasCourseToInstructorCourse(course, canvasUrl))
          .filter((course): course is InstructorCourse => course !== null);

        setCourses(baseCourses);

        void loadAssignmentCounts(baseCourses, token, canvasUrl).then(
          (coursesWithCounts) => {
            if (!cancelled) {
              setCourses(coursesWithCounts);
            }
          },
        );
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        if (loadError instanceof CanvasApiError && loadError.status === 401) {
          logout();
          return;
        }

        if (isCanvasConnectionRequiredError(loadError)) {
          setNeedsCanvasConnection(true);
          setCourses([]);
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
  }, [accessToken, canvasUrl, hasCanvasToken, logout, reloadToken]);

  return {
    courses,
    error,
    hasCanvasToken,
    isLoaded,
    isLoading: hasCanvasToken && !isLoaded && !error && !needsCanvasConnection,
    needsCanvasConnection,
    reloadCourses,
  };
}
