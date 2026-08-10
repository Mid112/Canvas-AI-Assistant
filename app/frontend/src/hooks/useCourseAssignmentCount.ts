import { useEffect, useState } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { isCanvasConnectionRequiredError } from "@/lib/canvas-connection";
import {
  AssignmentApiError,
  fetchCourseAssignments,
} from "@/services/assignments";

export function useCourseAssignmentCount(
  localCourseId: number,
  canvasUrl: string | undefined,
  enabled: boolean,
): number | null {
  const { accessToken } = useAuth();
  const [assignmentCount, setAssignmentCount] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled || !accessToken || !canvasUrl || localCourseId <= 0) {
      return;
    }

    const token = accessToken;
    const selectedCanvasUrl = canvasUrl;
    let cancelled = false;

    async function loadAssignmentCount() {
      try {
        const assignments = await fetchCourseAssignments(
          localCourseId,
          token,
          selectedCanvasUrl,
        );
        if (!cancelled) {
          setAssignmentCount(assignments.length);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (
          isCanvasConnectionRequiredError(error) ||
          error instanceof AssignmentApiError
        ) {
          setAssignmentCount(null);
        }
      }
    }

    void loadAssignmentCount();

    return () => {
      cancelled = true;
    };
  }, [accessToken, canvasUrl, enabled, localCourseId]);

  return assignmentCount;
}
