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
import {
  CanvasApiError,
  fetchActiveCourse,
  fetchCourses,
  setActiveCourse,
} from "@/services/canvas";
import type { ActiveCourse, CanvasCourse } from "@/types/canvas";
import type { InstructorCourse } from "@/types/course";

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

function toActiveCourseFromInstructor(course: InstructorCourse): ActiveCourse {
  return {
    local_id: course.id,
    canvas_course_id: String(course.id),
    canvas_url: "",
    name: `${course.code}: ${course.name}`,
    term: null,
  };
}

export function ActiveCourseProvider({ children }: { children: ReactNode }) {
  const { accessToken, user } = useAuth();
  const { courses: mockCourses, selectedInstitution } = useInstitution();
  const [activeCourse, setActiveCourseState] = useState<ActiveCourse | null>(null);
  const [availableCourses, setAvailableCourses] =
    useState<InstructorCourse[]>(mockCourses);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usesCanvasApi = Boolean(accessToken && user?.has_canvas_token);
  const persistenceScope = user
    ? String(user.id)
    : `institution-${selectedInstitution.id}`;

  const resolveLocalActiveCourse = useCallback(
    (courses: InstructorCourse[]): ActiveCourse | null => {
      const storedId = getStoredActiveCourseId(persistenceScope);
      const matched = courses.find((course) => course.id === storedId);
      return matched ? toActiveCourseFromInstructor(matched) : null;
    },
    [persistenceScope],
  );

  const refreshActiveCourse = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (usesCanvasApi && accessToken) {
        const [coursesData, active] = await Promise.all([
          fetchCourses(accessToken),
          fetchActiveCourse(accessToken),
        ]);

        const courses = coursesData
          .map(mapCanvasCourseToInstructorCourse)
          .filter((course): course is InstructorCourse => course !== null);

        setAvailableCourses(courses);
        setActiveCourseState(active);
        return;
      }

      setAvailableCourses(mockCourses);
      setActiveCourseState(resolveLocalActiveCourse(mockCourses));
    } catch (err) {
      const message =
        err instanceof CanvasApiError
          ? err.message
          : "Unable to load active course.";
      setError(message);
      setAvailableCourses(mockCourses);
      setActiveCourseState(resolveLocalActiveCourse(mockCourses));
    } finally {
      setIsLoading(false);
    }
  }, [
    accessToken,
    mockCourses,
    resolveLocalActiveCourse,
    usesCanvasApi,
  ]);

  useEffect(() => {
    void refreshActiveCourse();
  }, [refreshActiveCourse]);

  useEffect(() => {
    if (!usesCanvasApi) {
      setAvailableCourses(mockCourses);
      setActiveCourseState(resolveLocalActiveCourse(mockCourses));
    }
  }, [mockCourses, resolveLocalActiveCourse, usesCanvasApi]);

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
        if (usesCanvasApi && accessToken) {
          const saved = await setActiveCourse(localCourseId, accessToken);
          setActiveCourseState(saved);
          return;
        }

        setStoredActiveCourseId(persistenceScope, localCourseId);
        setActiveCourseState(toActiveCourseFromInstructor(selected));
      } catch (err) {
        const message =
          err instanceof CanvasApiError
            ? err.message
            : "Unable to save active course.";
        setError(message);
      } finally {
        setIsSaving(false);
      }
    },
    [accessToken, availableCourses, persistenceScope, usesCanvasApi],
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
