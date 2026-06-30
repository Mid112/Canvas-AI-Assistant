/**
 * Resolves a route-local course ID to the Canvas IDs the backend expects.
 *
 * App routes use local_id from our DB (e.g. /instructor/courses/3/assignments).
 * Canvas proxy endpoints use canvas_id + canvas_url query param instead.
 */
import { useEffect, useState } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { getPrimaryCanvasConnectionUrl } from "@/lib/canvas-connections";
import { isCanvasConnectionRequiredError } from "@/lib/canvas-connection";
import { CanvasApiError, fetchCourses } from "@/services/canvas";

export interface ResolvedCanvasCourse {
  localCourseId: number;
  canvasCourseId: number;
  canvasUrl: string;
  name: string;
  code: string;
}

export function useCanvasCourseByLocalId(localCourseId: number | null) {
  const { accessToken, user, logout } = useAuth();
  const canvasUrl = getPrimaryCanvasConnectionUrl(user);
  const [course, setCourse] = useState<ResolvedCanvasCourse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsCanvasConnection, setNeedsCanvasConnection] = useState(false);

  const isEnabled = Boolean(
    accessToken &&
      user?.has_canvas_token &&
      localCourseId != null &&
      Number.isInteger(localCourseId) &&
      localCourseId > 0,
  );

  useEffect(() => {
    if (!isEnabled || !accessToken || localCourseId == null) {
      setCourse(null);
      setError(null);
      setNeedsCanvasConnection(false);
      setIsLoading(false);
      return;
    }

    const token = accessToken;
    let cancelled = false;

    async function resolveCourse() {
      setIsLoading(true);
      setError(null);
      setNeedsCanvasConnection(false);

      try {
        const courses = await fetchCourses(token, canvasUrl);
        if (cancelled) {
          return;
        }

        const match = courses.find((item) => item.local_id === localCourseId);
        if (!match) {
          setCourse(null);
          setError(
            "Course not found for this institution. Try switching institution or open the course from the courses page.",
          );
          return;
        }

        setCourse({
          localCourseId,
          canvasCourseId: match.canvas_id,
          canvasUrl,
          name: match.name,
          code: match.course_code,
        });
      } catch (resolveError) {
        if (cancelled) {
          return;
        }

        if (resolveError instanceof CanvasApiError && resolveError.status === 401) {
          logout();
          return;
        }

        if (isCanvasConnectionRequiredError(resolveError)) {
          setNeedsCanvasConnection(true);
          setCourse(null);
          return;
        }

        setCourse(null);
        setError(
          resolveError instanceof CanvasApiError
            ? resolveError.message
            : "Unable to load course from Canvas.",
        );
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void resolveCourse();

    return () => {
      cancelled = true;
    };
  }, [accessToken, canvasUrl, isEnabled, localCourseId, logout]);

  return {
    course,
    error,
    isLoading: isEnabled && isLoading,
    needsCanvasConnection,
  };
}
