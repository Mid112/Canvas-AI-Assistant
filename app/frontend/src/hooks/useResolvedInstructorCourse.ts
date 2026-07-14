import { useEffect, useMemo, useRef } from "react";
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
  const {
    availableCourses,
    isLoading,
    isLoaded,
    error,
    needsCanvasConnection,
    refreshActiveCourse,
  } = useActiveCourse();

  const idIsValid = Number.isInteger(localCourseId) && localCourseId > 0;

  const course = useMemo(
    () =>
      idIsValid
        ? (availableCourses.find((entry) => entry.id === localCourseId) ?? null)
        : null,
    [availableCourses, idIsValid, localCourseId],
  );

  // course resolves from ActiveCourseProvider's already-fetched list rather than
  // fetching independently — if the requested id isn't in that list yet (e.g. a
  // direct/bookmarked link opened before the provider's own fetch resolved, or a
  // course synced in another tab since this session's last fetch), retry once via
  // a shared refresh rather than immediately reporting "not found."
  const retriedForIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (!idIsValid || course || isLoading || !isLoaded || needsCanvasConnection) {
      return;
    }
    if (retriedForIdRef.current === localCourseId) {
      return;
    }
    retriedForIdRef.current = localCourseId;
    void refreshActiveCourse();
  }, [
    course,
    idIsValid,
    isLoaded,
    isLoading,
    localCourseId,
    needsCanvasConnection,
    refreshActiveCourse,
  ]);

  const fallbackCanvasUrl = useMemo(
    () =>
      resolveCanvasApiUrl(
        user,
        selectedInstitution.id,
        selectedInstitution.canvasUrl,
      ),
    [selectedInstitution.canvasUrl, selectedInstitution.id, user],
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
