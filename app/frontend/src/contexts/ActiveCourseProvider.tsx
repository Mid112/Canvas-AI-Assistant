import {
  useCallback,
  useEffect,
  useMemo,
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
import { CanvasApiError, fetchCourses } from "@/services/canvas";
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
  const [availableCourses, setAvailableCourses] =
    useState<InstructorCourse[]>(mockCourses);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const refreshActiveCourse = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (usesCanvasCourses && accessToken) {
        const coursesData = await fetchCourses(accessToken, canvasUrl);
        const courses = coursesData
          .map(mapCanvasCourseToInstructorCourse)
          .filter((course): course is InstructorCourse => course !== null);

        setAvailableCourses(courses.length > 0 ? courses : mockCourses);
        setActiveCourseState(
          resolveStoredActiveCourse(courses.length > 0 ? courses : mockCourses),
        );
        return;
      }

      setAvailableCourses(mockCourses);
      setActiveCourseState(resolveStoredActiveCourse(mockCourses));
    } catch (err) {
      const message =
        err instanceof CanvasApiError
          ? err.message
          : "Unable to load courses.";
      setError(message);
      setAvailableCourses(mockCourses);
      setActiveCourseState(resolveStoredActiveCourse(mockCourses));
    } finally {
      setIsLoading(false);
    }
  }, [
    accessToken,
    canvasUrl,
    mockCourses,
    resolveStoredActiveCourse,
    usesCanvasCourses,
  ]);

  useEffect(() => {
    void refreshActiveCourse();
  }, [refreshActiveCourse]);

  useEffect(() => {
    if (!usesCanvasCourses) {
      setAvailableCourses(mockCourses);
      setActiveCourseState(resolveStoredActiveCourse(mockCourses));
    }
  }, [mockCourses, resolveStoredActiveCourse, usesCanvasCourses]);

  const selectActiveCourse = useCallback(
    async (localCourseId: number) => {
      const selected = availableCourses.find((course) => course.id === localCourseId);
      if (!selected) {
        setError("Selected course is not available.");
        return;
      }

      setIsSaving(true);
      setError(null);

      try {
        setStoredActiveCourseId(persistenceScope, localCourseId);
        setActiveCourseState(toActiveCourseSelection(selected));
      } finally {
        setIsSaving(false);
      }
    },
    [availableCourses, persistenceScope],
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
