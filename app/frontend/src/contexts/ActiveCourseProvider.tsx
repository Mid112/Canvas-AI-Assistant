import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useAuth } from "@/contexts/AuthContext";
import { ActiveCourseContext } from "@/contexts/active-course-context";
import { useInstitution } from "@/contexts/useInstitution";
import {
  getStoredActiveCourseId,
  setStoredActiveCourseId,
} from "@/lib/active-course-storage";
import { getPrimaryCanvasConnectionUrl } from "@/lib/canvas-connections";
import {
  CanvasApiError,
  fetchActiveCourse,
  fetchCourses,
  setActiveCourse as persistActiveCourse,
} from "@/services/canvas";
import type { CanvasCourse } from "@/types/canvas";
import type { ActiveCourseSelection, InstructorCourse } from "@/types/course";

function mapCanvasCourseToInstructorCourse(
  course: CanvasCourse,
): InstructorCourse | null {
  if (course.local_id == null) {
    return null;
  }

  return {
    id: course.local_id,
    code: course.course_code,
    name: course.name,
    progress: 0,
    studentCount: course.total_students ?? 0,
    assignmentCount: 0,
    lastActivity: "Synced from Canvas",
  };
}

function toActiveCourseSelection(
  course: InstructorCourse,
): ActiveCourseSelection {
  return {
    localId: course.id,
    displayName: `${course.code}: ${course.name}`,
  };
}

export function ActiveCourseProvider({ children }: { children: ReactNode }) {
  const { accessToken, user } = useAuth();
  const { courses: mockCourses, selectedInstitution } = useInstitution();
  const [activeCourse, setActiveCourseState] = useState<ActiveCourseSelection | null>(
    null,
  );
  const [availableCourses, setAvailableCourses] = useState<InstructorCourse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const usesCanvasCourses = Boolean(accessToken && user?.has_canvas_token);
  const canvasUrl = getPrimaryCanvasConnectionUrl(user);
  const persistenceScope = user
    ? String(user.id)
    : `institution-${selectedInstitution.id}`;

  const resolveStoredActiveCourse = useCallback(
    (courses: InstructorCourse[]): ActiveCourseSelection | null => {
      const storedId = getStoredActiveCourseId(persistenceScope);
      const matched = courses.find((course) => course.id === storedId);
      return matched ? toActiveCourseSelection(matched) : null;
    },
    [persistenceScope],
  );

  const applyActiveCourseFromList = useCallback(
    (
      courses: InstructorCourse[],
      preferredLocalId?: number | null,
    ): ActiveCourseSelection | null => {
      if (preferredLocalId != null) {
        const preferred = courses.find((course) => course.id === preferredLocalId);
        if (preferred) {
          return toActiveCourseSelection(preferred);
        }
      }

      return resolveStoredActiveCourse(courses);
    },
    [resolveStoredActiveCourse],
  );

  const refreshActiveCourse = useCallback(async () => {
    if (isMountedRef.current) {
      setIsLoading(true);
      setError(null);
    }

    try {
      if (usesCanvasCourses && accessToken) {
        const [coursesData, serverActive] = await Promise.all([
          fetchCourses(accessToken, canvasUrl),
          fetchActiveCourse(accessToken).catch(() => null),
        ]);

        const courses = coursesData
          .map(mapCanvasCourseToInstructorCourse)
          .filter((course): course is InstructorCourse => course !== null);

        if (isMountedRef.current) {
          setAvailableCourses(courses);
          setActiveCourseState(
            applyActiveCourseFromList(
              courses,
              serverActive?.local_id ?? getStoredActiveCourseId(persistenceScope),
            ),
          );
        }
        return;
      }

      if (isMountedRef.current) {
        setAvailableCourses(mockCourses);
        setActiveCourseState(resolveStoredActiveCourse(mockCourses));
      }
    } catch (err) {
      const message =
        err instanceof CanvasApiError
          ? err.message
          : "Unable to load courses.";
      if (isMountedRef.current) {
        setError(message);
        if (usesCanvasCourses) {
          setAvailableCourses([]);
          setActiveCourseState(null);
        } else {
          setAvailableCourses(mockCourses);
          setActiveCourseState(resolveStoredActiveCourse(mockCourses));
        }
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [
    accessToken,
    applyActiveCourseFromList,
    canvasUrl,
    mockCourses,
    persistenceScope,
    resolveStoredActiveCourse,
    usesCanvasCourses,
  ]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate active course on mount and auth changes
    void refreshActiveCourse();
  }, [refreshActiveCourse]);

  useEffect(() => {
    if (!usesCanvasCourses && isMountedRef.current) {
      setAvailableCourses(mockCourses);
      setActiveCourseState(resolveStoredActiveCourse(mockCourses));
    }
  }, [mockCourses, resolveStoredActiveCourse, usesCanvasCourses]);

  const selectActiveCourse = useCallback(
    async (localCourseId: number) => {
      const selected = availableCourses.find((course) => course.id === localCourseId);
      if (!selected) {
        if (isMountedRef.current) {
          setError("Selected course is not available.");
        }
        return;
      }

      if (isMountedRef.current) {
        setIsSaving(true);
        setError(null);
      }

      try {
        if (usesCanvasCourses && accessToken) {
          await persistActiveCourse(localCourseId, accessToken);
        }

        setStoredActiveCourseId(persistenceScope, localCourseId);
        if (isMountedRef.current) {
          setActiveCourseState(toActiveCourseSelection(selected));
        }
      } catch (err) {
        const message =
          err instanceof CanvasApiError
            ? err.message
            : "Unable to save active course.";
        if (isMountedRef.current) {
          setError(message);
        }
      } finally {
        if (isMountedRef.current) {
          setIsSaving(false);
        }
      }
    },
    [accessToken, availableCourses, persistenceScope, usesCanvasCourses],
  );

  const value = useMemo(
    () => ({
      activeCourse,
      availableCourses,
      isLoading,
      isSaving,
      error,
      selectActiveCourse,
      refreshActiveCourse,
    }),
    [
      activeCourse,
      availableCourses,
      error,
      isLoading,
      isSaving,
      refreshActiveCourse,
      selectActiveCourse,
    ],
  );

  return (
    <ActiveCourseContext.Provider value={value}>
      {children}
    </ActiveCourseContext.Provider>
  );
}
