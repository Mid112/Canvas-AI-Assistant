import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveCourse } from "@/contexts/useActiveCourse";
import { useInstitution } from "@/contexts/useInstitution";
import { resolveCanvasApiUrl } from "@/lib/canvas-connections";
import type { InstructorCourse } from "@/types/course";

interface UseResolvedInstructorCourseResult {
  course: InstructorCourse | null;
  canvasUrl: string | undefined;
  isLoading: boolean;
  loadError: string | null;
  needsCanvasConnection: boolean;
}

/**
 * Resolves a local course id from the URL to synced Canvas metadata, including
 * the canvas_url that must be sent on assignment/student/submission API calls.
 *
 * Reads from the app-wide course list in ActiveCourseProvider (a single,
 * shared Canvas fetch) rather than fetching its own — this used to be one of
 * five independent `fetchCourses` calls across the app, which could each
 * return a slightly different snapshot of Canvas's course list.
 */
export function useResolvedInstructorCourse(
  localCourseId: number,
): UseResolvedInstructorCourseResult {
  const { user } = useAuth();
  const { selectedInstitution } = useInstitution();
  const { availableCourses, isLoading, error, needsCanvasConnection } =
    useActiveCourse();

  const idIsValid = Number.isInteger(localCourseId) && localCourseId > 0;

  const course = useMemo(
    () =>
      idIsValid
        ? (availableCourses.find((entry) => entry.id === localCourseId) ?? null)
        : null,
    [availableCourses, idIsValid, localCourseId],
  );

  const fallbackCanvasUrl = useMemo(
    () => resolveCanvasApiUrl(user, selectedInstitution.id),
    [selectedInstitution.id, user],
  );

  const canvasUrl = course?.canvasUrl
    ? resolveCanvasApiUrl(user, selectedInstitution.id, course.canvasUrl)
    : fallbackCanvasUrl;

  return {
    course,
    canvasUrl,
    isLoading,
    loadError: error,
    needsCanvasConnection,
  };
}
