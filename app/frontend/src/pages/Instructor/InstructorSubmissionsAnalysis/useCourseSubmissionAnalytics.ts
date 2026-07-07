import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

export function useCourseSubmissionAnalytics(
  localCourseId: number,
  selectedAssignmentId: string,
  assignmentIdFromUrl: string | null,
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

  const canvasAssignmentsRef = useRef(canvasAssignments);
  canvasAssignmentsRef.current = canvasAssignments;

  const hasCanvasToken = Boolean(accessToken && user?.has_canvas_token);

  useEffect(() => {
    if (!hasCanvasToken || !Number.isInteger(localCourseId) || localCourseId <= 0) {
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
      );

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
    selectedInstitution.id,
    user,
  ]);

  const reloadSelectedAssignment = useCallback(
    async (assignmentId: string) => {
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

      const assignment = canvasAssignmentsRef.current.find(
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
        setIsLoadingSubmissions(false);
      }
    },
    [
      accessToken,
      course,
      hasCanvasToken,
      localCourseId,
      logout,
      selectedInstitution.id,
      user,
    ],
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

    void reloadSelectedAssignment(effectiveCanvasAssignmentId);
  }, [
    canvasAssignments.length,
    course?.id,
    effectiveCanvasAssignmentId,
    reloadSelectedAssignment,
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
