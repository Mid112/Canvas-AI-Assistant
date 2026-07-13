import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { useInstitution } from "@/contexts/useInstitution";
import { resolveCanvasApiUrl } from "@/lib/canvas-connections";
import { isCanvasConnectionRequiredError } from "@/lib/canvas-connection";
import { mapCanvasCourseToInstructorCourse } from "@/pages/Instructor/InstructorCourses/mapCanvasCourse";
import {
  AssignmentApiError,
  fetchCourseAssignments,
} from "@/services/assignments";
import { CanvasApiError, fetchCourses } from "@/services/canvas";
import {
  SubmissionApiError,
  fetchAssignmentSubmissions,
} from "@/services/submissions";
import type { Assignment } from "@/types/assignment";
import type { InstructorCourse } from "@/types/course";
import type { AssignmentSubmissionAnalysis } from "@/types/submission";

import {
  createAssignmentPlaceholder,
  mapApiSubmissionsToAnalysis,
} from "./mapSubmissionAnalytics";
import { resolveEffectiveCanvasAssignmentId } from "./submissionNavigation";

interface UseCourseSubmissionAnalyticsResult {
  course: InstructorCourse | null;
  assignments: AssignmentSubmissionAnalysis[];
  isLoading: boolean;
  isLoadingSubmissions: boolean;
  loadError: string | null;
  needsCanvasConnection: boolean;
  reloadSelectedAssignment: (assignmentId: string) => Promise<void>;
}

interface UseCourseSubmissionAnalyticsOptions {
  seedCourse?: InstructorCourse | null;
  seedCanvasUrl?: string;
}

export function useCourseSubmissionAnalytics(
  localCourseId: number,
  selectedAssignmentId: string,
  assignmentIdFromUrl: string | null,
  options?: UseCourseSubmissionAnalyticsOptions,
): UseCourseSubmissionAnalyticsResult {
  const { accessToken, user, logout } = useAuth();
  const { selectedInstitution } = useInstitution();
  const [course, setCourse] = useState<InstructorCourse | null>(null);
  const [canvasAssignments, setCanvasAssignments] = useState<Assignment[]>([]);
  const [assignments, setAssignments] = useState<AssignmentSubmissionAnalysis[]>(
    [],
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [needsCanvasConnection, setNeedsCanvasConnection] = useState(false);

  const hasCanvasToken = Boolean(accessToken && user?.has_canvas_token);

  useEffect(() => {
    if (!hasCanvasToken || !Number.isInteger(localCourseId) || localCourseId <= 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when prerequisites are missing
      setIsLoading(false);
      return;
    }

    if (!accessToken) {
      return;
    }

    const token = accessToken;
    let cancelled = false;

    async function loadCourseAndAssignments() {
      const fallbackCanvasUrl = resolveCanvasApiUrl(
        user,
        selectedInstitution.id,
        selectedInstitution.canvasUrl,
      );

      const seededCourse = options?.seedCourse ?? null;
      const seededCanvasUrl =
        options?.seedCanvasUrl ??
        (seededCourse?.canvasUrl
          ? resolveCanvasApiUrl(user, selectedInstitution.id, seededCourse.canvasUrl)
          : undefined);

      if (seededCourse && seededCanvasUrl) {
        setIsLoading(true);
        setLoadError(null);
        setNeedsCanvasConnection(false);

        try {
          const assignmentList = await fetchCourseAssignments(
            localCourseId,
            token,
            seededCanvasUrl,
          );
          if (cancelled) {
            return;
          }

          setCourse(seededCourse);
          setCanvasAssignments(assignmentList);
          setAssignments(
            assignmentList.map((assignment) =>
              createAssignmentPlaceholder(assignment, seededCourse),
            ),
          );
        } catch (error) {
          if (cancelled) {
            return;
          }

          if (error instanceof AssignmentApiError && error.status === 401) {
            logout();
            return;
          }

          if (isCanvasConnectionRequiredError(error)) {
            setNeedsCanvasConnection(true);
            setCourse(null);
            setCanvasAssignments([]);
            setAssignments([]);
            return;
          }

          const message =
            error instanceof AssignmentApiError
              ? error.message
              : "Unable to load course analytics.";
          setLoadError(message);
          setCourse(null);
          setCanvasAssignments([]);
          setAssignments([]);
        } finally {
          if (!cancelled) {
            setIsLoading(false);
          }
        }

        return;
      }

      if (!fallbackCanvasUrl) {
        setNeedsCanvasConnection(true);
        setCourse(null);
        setCanvasAssignments([]);
        setAssignments([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setLoadError(null);
      setNeedsCanvasConnection(false);

      try {
        const courses = await fetchCourses(token, fallbackCanvasUrl);
        if (cancelled) {
          return;
        }

        const matchedCourse = courses
          .map((entry) => mapCanvasCourseToInstructorCourse(entry, fallbackCanvasUrl))
          .find((entry) => entry?.id === localCourseId);

        if (!matchedCourse) {
          setCourse(null);
          setCanvasAssignments([]);
          setAssignments([]);
          setLoadError("This course is not available in your synced Canvas courses.");
          return;
        }

        const selectedCanvasUrl = resolveCanvasApiUrl(
          user,
          selectedInstitution.id,
          matchedCourse.canvasUrl,
        );

        if (!selectedCanvasUrl) {
          setNeedsCanvasConnection(true);
          setCourse(null);
          setCanvasAssignments([]);
          setAssignments([]);
          return;
        }

        const assignmentList = await fetchCourseAssignments(
          localCourseId,
          token,
          selectedCanvasUrl,
        );
        if (cancelled) {
          return;
        }

        setCourse(matchedCourse);
        setCanvasAssignments(assignmentList);
        setAssignments(
          assignmentList.map((assignment) =>
            createAssignmentPlaceholder(assignment, matchedCourse),
          ),
        );
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
          setCanvasAssignments([]);
          setAssignments([]);
          return;
        }

        const message =
          error instanceof CanvasApiError ||
          error instanceof AssignmentApiError
            ? error.message
            : "Unable to load course analytics.";
        setLoadError(message);
        setCourse(null);
        setCanvasAssignments([]);
        setAssignments([]);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadCourseAndAssignments();

    return () => {
      cancelled = true;
    };
  }, [
    accessToken,
    hasCanvasToken,
    localCourseId,
    logout,
    selectedInstitution.canvasUrl,
    selectedInstitution.id,
    user,
    options?.seedCourse,
    options?.seedCanvasUrl,
  ]);

  const loadSubmissionAnalysis = useCallback(
    async (
      assignmentId: string,
      options?: { isCancelled?: () => boolean },
    ) => {
      if (!hasCanvasToken || !accessToken || !course) {
        return;
      }

      const selectedCanvasUrl = resolveCanvasApiUrl(
        user,
        selectedInstitution.id,
        course.canvasUrl,
      );

      if (!selectedCanvasUrl) {
        setNeedsCanvasConnection(true);
        return;
      }

      const assignment = canvasAssignments.find(
        (entry) => String(entry.id) === assignmentId,
      );
      if (!assignment) {
        return;
      }

      setIsLoadingSubmissions(true);
      setLoadError(null);

      try {
        const submissions = await fetchAssignmentSubmissions(
          localCourseId,
          assignment.id,
          accessToken,
          selectedCanvasUrl,
        );
        if (options?.isCancelled?.()) {
          return;
        }

        const analysis = mapApiSubmissionsToAnalysis(
          assignment,
          course,
          submissions,
        );
        setAssignments((current) =>
          current.map((entry) =>
            entry.id === assignmentId ? analysis : entry,
          ),
        );
      } catch (error) {
        if (options?.isCancelled?.()) {
          return;
        }

        if (error instanceof SubmissionApiError && error.status === 401) {
          logout();
          return;
        }

        if (isCanvasConnectionRequiredError(error)) {
          setNeedsCanvasConnection(true);
          return;
        }

        const message =
          error instanceof SubmissionApiError
            ? error.message
            : "Unable to load submissions for this assignment.";
        setLoadError(message);
      } finally {
        if (!options?.isCancelled?.()) {
          setIsLoadingSubmissions(false);
        }
      }
    },
    [
      accessToken,
      canvasAssignments,
      course,
      hasCanvasToken,
      localCourseId,
      logout,
      selectedInstitution.id,
      user,
    ],
  );

  const reloadSelectedAssignment = useCallback(
    (assignmentId: string) => loadSubmissionAnalysis(assignmentId),
    [loadSubmissionAnalysis],
  );

  const effectiveCanvasAssignmentId = useMemo(
    () =>
      resolveEffectiveCanvasAssignmentId(
        canvasAssignments,
        selectedAssignmentId,
        assignmentIdFromUrl,
      ),
    [assignmentIdFromUrl, canvasAssignments, selectedAssignmentId],
  );

  useEffect(() => {
    if (
      !effectiveCanvasAssignmentId ||
      !course ||
      canvasAssignments.length === 0
    ) {
      return;
    }

    let cancelled = false;

    async function loadSelectedSubmissions() {
      await Promise.resolve();
      if (cancelled) {
        return;
      }

      await loadSubmissionAnalysis(effectiveCanvasAssignmentId, {
        isCancelled: () => cancelled,
      });
    }

    void loadSelectedSubmissions();

    return () => {
      cancelled = true;
    };
  }, [
    canvasAssignments.length,
    course,
    effectiveCanvasAssignmentId,
    loadSubmissionAnalysis,
  ]);

  return {
    course,
    assignments,
    isLoading,
    isLoadingSubmissions,
    loadError,
    needsCanvasConnection,
    reloadSelectedAssignment,
  };
}
