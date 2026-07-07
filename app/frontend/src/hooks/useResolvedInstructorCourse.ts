import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useInstitution } from "@/contexts/useInstitution";
import { resolveCanvasApiUrl } from "@/lib/canvas-connections";
import { isCanvasConnectionRequiredError } from "@/lib/canvas-connection";
import { mapCanvasCourseToInstructorCourse } from "@/pages/Instructor/InstructorCourses/mapCanvasCourse";
import { CanvasApiError, fetchCourses } from "@/services/canvas";
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
 */
export function useResolvedInstructorCourse(
  localCourseId: number,
): UseResolvedInstructorCourseResult {
  const { accessToken, user, logout } = useAuth();
  const { selectedInstitution } = useInstitution();
  const [course, setCourse] = useState<InstructorCourse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [needsCanvasConnection, setNeedsCanvasConnection] = useState(false);

  const idIsValid = Number.isInteger(localCourseId) && localCourseId > 0;
  const hasCanvasToken = Boolean(accessToken && user?.has_canvas_token);

  const fallbackCanvasUrl = useMemo(
    () => resolveCanvasApiUrl(user, selectedInstitution.id),
    [selectedInstitution.id, user],
  );

  const canvasUrl = course?.canvasUrl
    ? resolveCanvasApiUrl(user, selectedInstitution.id, course.canvasUrl)
    : fallbackCanvasUrl;

  useEffect(() => {
    if (!hasCanvasToken || !accessToken || !idIsValid) {
      return;
    }

    if (!fallbackCanvasUrl) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync connection state
      setNeedsCanvasConnection(true);
      setCourse(null);
      setIsLoading(false);
      return;
    }

    const token = accessToken;
    const selectedCanvasUrl = fallbackCanvasUrl;
    let cancelled = false;

    async function loadCourse() {
      setIsLoading(true);
      setLoadError(null);
      setNeedsCanvasConnection(false);

      try {
        const courses = await fetchCourses(token, selectedCanvasUrl);
        if (cancelled) {
          return;
        }

        const matched = courses
          .map((entry) =>
            mapCanvasCourseToInstructorCourse(entry, selectedCanvasUrl),
          )
          .find((entry) => entry?.id === localCourseId);

        setCourse(matched ?? null);
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (error instanceof CanvasApiError && error.status === 401) {
          logout();
          return;
        }

        if (isCanvasConnectionRequiredError(error)) {
          setNeedsCanvasConnection(true);
          setCourse(null);
          return;
        }

        const message =
          error instanceof CanvasApiError
            ? error.message
            : "Unable to load course details from Canvas.";
        setLoadError(message);
        setCourse(null);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadCourse();

    return () => {
      cancelled = true;
    };
  }, [
    accessToken,
    fallbackCanvasUrl,
    hasCanvasToken,
    idIsValid,
    localCourseId,
    logout,
  ]);

  return {
    course,
    canvasUrl,
    isLoading,
    loadError,
    needsCanvasConnection,
  };
}
