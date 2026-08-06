// Hook note: packages use course overview state/effects for route components that need the same behavior.

import { useEffect, useState } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { isCanvasConnectionRequiredError } from "@/lib/canvas-connection";
import { ApiRequestError } from "@/lib/api-request";
import { fetchCourseOverview } from "@/services/courseOverview";
import type { CourseOverviewData } from "@/types/courseOverview";

interface UseCourseOverviewResult {
  overview: CourseOverviewData | null;
  isLoading: boolean;
  loadError: string | null;
}

export function useCourseOverview(
  localCourseId: number,
  canvasUrl: string | undefined,
  enabled: boolean,
): UseCourseOverviewResult {
  const { accessToken, logout } = useAuth();
  const [overview, setOverview] = useState<CourseOverviewData | null>(null);
  const [isLoading, setIsLoading] = useState(() => enabled);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !accessToken || !canvasUrl || localCourseId <= 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when prerequisites are missing
      setIsLoading(false);
      return;
    }

    const token = accessToken;
    const selectedCanvasUrl = canvasUrl;
    let cancelled = false;

    async function loadOverview() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const data = await fetchCourseOverview(
          localCourseId,
          token,
          selectedCanvasUrl,
        );
        if (!cancelled) {
          setOverview(data);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (error instanceof ApiRequestError) {
          if (error.status === 401) {
            logout();
            return;
          }
        }

        if (isCanvasConnectionRequiredError(error)) {
          setOverview(null);
          return;
        }

        const message =
          error instanceof ApiRequestError
            ? error.message
            : "Unable to load course overview.";
        setLoadError(message);
        setOverview(null);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadOverview();

    return () => {
      cancelled = true;
    };
  }, [accessToken, canvasUrl, enabled, localCourseId, logout]);

  return { overview, isLoading, loadError };
}
