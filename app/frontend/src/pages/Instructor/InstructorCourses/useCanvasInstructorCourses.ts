// Instructor page note: coordinates use canvas instructor courses UI state with Canvas-backed services and active-course context.

import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { useActiveCourse } from "@/contexts/useActiveCourse";
import { useCanvasConnectionUrl } from "@/hooks/useCanvasConnectionUrl";
import { fetchCourseAssignments } from "@/services/assignments";
import type { InstructorCourse } from "@/types/course";

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
          course.canvasUrl ?? canvasUrl,
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
 * Reads the instructor's Canvas courses from the shared ActiveCourseProvider
 * list (one fetch for the whole app) and layers in per-course assignment
 * counts, fetched in the background with limited concurrency.
 */
export function useCanvasInstructorCourses() {
  const { accessToken, user } = useAuth();
  const canvasUrl = useCanvasConnectionUrl();
  const {
    availableCourses,
    isLoading,
    isLoaded,
    error,
    needsCanvasConnection,
    refreshActiveCourse,
  } = useActiveCourse();
  // Keyed by course id — filled in as the background assignment-count fetch
  // resolves, and merged onto the shared course list below rather than
  // storing a second copy of the whole list in state.
  const [assignmentCounts, setAssignmentCounts] = useState<Map<number, number>>(
    new Map(),
  );

  const hasCanvasToken = Boolean(accessToken && user?.has_canvas_token);

  useEffect(() => {
    if (availableCourses.length === 0) {
      // Nothing to merge counts onto — clear any counts left over from a
      // previous, now-replaced course list rather than letting them linger.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when prerequisites are missing
      setAssignmentCounts(new Map());
      return;
    }

    if (!accessToken || !canvasUrl) {
      return;
    }

    const token = accessToken;
    let cancelled = false;

    void loadAssignmentCounts(availableCourses, token, canvasUrl).then(
      (coursesWithCounts) => {
        if (!cancelled) {
          setAssignmentCounts(
            new Map(
              coursesWithCounts.map((course) => [course.id, course.assignmentCount]),
            ),
          );
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [accessToken, availableCourses, canvasUrl]);

  const courses = useMemo(
    () =>
      availableCourses.map((course) => {
        const count = assignmentCounts.get(course.id);
        return count === undefined ? course : { ...course, assignmentCount: count };
      }),
    [availableCourses, assignmentCounts],
  );

  return {
    courses,
    error,
    hasCanvasToken,
    isLoaded,
    isLoading,
    needsCanvasConnection,
    reloadCourses: refreshActiveCourse,
  };
}
