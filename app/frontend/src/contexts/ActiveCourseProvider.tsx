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
import { formatInstructorCourseTitle } from "@/lib/format-course-title";
import {
  getStoredActiveCourseId,
  getStoredActiveCourseSelection,
  setStoredActiveCourseSelection,
} from "@/lib/active-course-storage";
import { resolveCanvasApiUrl } from "@/lib/canvas-connections";
import { isCanvasConnectionRequiredError } from "@/lib/canvas-connection";
import { mapCanvasCourseToInstructorCourse } from "@/pages/Instructor/InstructorCourses/mapCanvasCourse";
import {
  CanvasApiError,
  fetchActiveCourse,
  fetchCourses,
  setActiveCourse as persistActiveCourse,
} from "@/services/canvas";
import type { ActiveCourseResponse } from "@/types/canvas";
import type { ActiveCourseSelection, InstructorCourse } from "@/types/course";

// Must exceed the backend's own per-call Canvas timeout (10s, see
// integrations/canvas.py's httpx.Timeout) with real margin — a shorter
// value here means the UI can show "timed out" while the backend is
// still legitimately within its own budget and would have succeeded.
const COURSE_SYNC_TIMEOUT_MS = 20000;

function toActiveCourseSelection(
  course: InstructorCourse,
): ActiveCourseSelection {
  return {
    localId: course.id,
    displayName: formatInstructorCourseTitle(course),
  };
}

function resolveOptimisticSelection(
  course: InstructorCourse | ActiveCourseSelection | undefined,
): ActiveCourseSelection | null {
  if (!course) {
    return null;
  }

  if ("localId" in course) {
    return course;
  }

  return toActiveCourseSelection(course);
}

function toActiveCourseSelectionFromResponse(
  course: ActiveCourseResponse,
): ActiveCourseSelection {
  return {
    localId: course.local_id,
    displayName: course.name,
  };
}

function fetchCoursesWithTimeout(
  accessToken: string,
  canvasUrl: string,
): Promise<CanvasCourse[]> {
  return Promise.race([
    fetchCourses(accessToken, canvasUrl),
    new Promise<never>((_, reject) => {
      window.setTimeout(
        () => reject(new CanvasApiError("Canvas course sync timed out.", 504)),
        COURSE_SYNC_TIMEOUT_MS,
      );
    }),
  ]);
}

export function ActiveCourseProvider({ children }: { children: ReactNode }) {
  const { accessToken, user } = useAuth();
  const { selectedInstitution } = useInstitution();
  const [activeCourse, setActiveCourseState] = useState<ActiveCourseSelection | null>(
    null,
  );
  const [availableCourses, setAvailableCourses] = useState<InstructorCourse[]>([]);
  const [coursesRevision, setCoursesRevision] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    // Reset on every (re)mount — without this, React 18 StrictMode's dev-only
    // mount -> cleanup -> remount cycle runs the cleanup below once and never
    // sets the ref back to true, permanently poisoning every isMountedRef
    // check for the rest of the component's real lifetime.
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const usesCanvasCourses = Boolean(
    accessToken && user?.has_canvas_token && user.role === "instructor",
  );
  const canvasUrl = resolveCanvasApiUrl(
    user,
    selectedInstitution.id,
    selectedInstitution.canvasUrl,
  );
  const persistenceScope = user
    ? String(user.id)
    : `institution-${selectedInstitution.id}`;

  const resolveStoredActiveCourse = useCallback(
    (courses: InstructorCourse[]): ActiveCourseSelection | null => {
      const stored = getStoredActiveCourseSelection(persistenceScope);
      const storedId = stored?.localId ?? null;
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
      // Hydrate from local storage before any Canvas request so navigation to
      // the assistant can display and use the chosen course immediately.
      setActiveCourseState(getStoredActiveCourseSelection(persistenceScope));
    }

    try {
      if (usesCanvasCourses && accessToken) {
        const serverActive = await fetchActiveCourse(accessToken).catch(() => null);
        if (isMountedRef.current && serverActive) {
          setActiveCourseState(toActiveCourseSelectionFromResponse(serverActive));
        }

        if (!canvasUrl) {
          if (isMountedRef.current) {
            setAvailableCourses([]);
            if (!serverActive) {
              setActiveCourseState(null);
            }
          }
          return;
        }

        const coursesData = await fetchCoursesWithTimeout(accessToken, canvasUrl);

        const courses = coursesData
          .map((course) => mapCanvasCourseToInstructorCourse(course, canvasUrl))
          .filter((course): course is InstructorCourse => course !== null);
        const selectedFromList = applyActiveCourseFromList(
          courses,
          serverActive?.local_id ?? getStoredActiveCourseId(persistenceScope),
        );

        if (isMountedRef.current) {
          setAvailableCourses(courses);
          setActiveCourseState(
            selectedFromList ??
              (serverActive
                ? toActiveCourseSelectionFromResponse(serverActive)
                : null),
          );
        }
        return;
      }

      if (isMountedRef.current) {
        setAvailableCourses([]);
        setActiveCourseState(null);
      }
    } catch (err) {
      if (isCanvasConnectionRequiredError(err)) {
        if (isMountedRef.current) {
          setAvailableCourses([]);
          setActiveCourseState(null);
          setError(null);
        }
        return;
      }

      const message =
        err instanceof CanvasApiError
          ? err.message
          : "Unable to load courses.";
      if (isMountedRef.current) {
        setError(message);
        if (usesCanvasCourses) {
          setAvailableCourses([]);
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
    persistenceScope,
    usesCanvasCourses,
  ]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate active course on mount and auth changes
    void refreshActiveCourse();
  }, [refreshActiveCourse]);

  const notifyCoursesChanged = useCallback(() => {
    setCoursesRevision((count) => count + 1);
  }, []);

  const selectActiveCourse = useCallback(
    async (
      localCourseId: number,
      optimisticCourse?: InstructorCourse | ActiveCourseSelection,
    ): Promise<boolean> => {
      const selected = availableCourses.find((course) => course.id === localCourseId);
      const optimisticSelection =
        selected ? toActiveCourseSelection(selected) : resolveOptimisticSelection(optimisticCourse);
      // Canvas-backed selection can still succeed when this provider's course
      // cache is stale; the backend validates ownership and returns the course.
      if (!optimisticSelection && !selected && (!usesCanvasCourses || !accessToken)) {
        if (isMountedRef.current) {
          setError("Selected course is not available.");
        }
        return false;
      }

      const previousActiveCourse = activeCourse;
      if (isMountedRef.current) {
        setIsSaving(true);
        setError(null);
        if (optimisticSelection) {
          setActiveCourseState(optimisticSelection);
        }
      }

      try {
        let persistedSelection: ActiveCourseSelection | null = null;
        if (usesCanvasCourses && accessToken) {
          const persisted = await persistActiveCourse(localCourseId, accessToken);
          // Use the server response as a fallback display value when the click
          // originated from another course loader, such as InstructorCoursesPage.
          persistedSelection = toActiveCourseSelectionFromResponse(persisted);
        }

        const nextSelection =
          selected
            ? toActiveCourseSelection(selected)
            : persistedSelection ?? optimisticSelection;
        setStoredActiveCourseSelection(persistenceScope, nextSelection);
        if (isMountedRef.current) {
          setActiveCourseState(nextSelection);
        }
        return true;
      } catch (err) {
        const message =
          err instanceof CanvasApiError
            ? err.message
            : "Unable to save active course.";
        if (isMountedRef.current) {
          setError(message);
          setActiveCourseState(previousActiveCourse);
        }
        setStoredActiveCourseSelection(persistenceScope, previousActiveCourse);
        return false;
      } finally {
        if (isMountedRef.current) {
          setIsSaving(false);
        }
      }
    },
    [accessToken, activeCourse, availableCourses, persistenceScope, usesCanvasCourses],
  );

  const value = useMemo(
    () => ({
      activeCourse,
      availableCourses,
      coursesRevision,
      isLoading,
      isSaving,
      error,
      selectActiveCourse,
      refreshActiveCourse,
      notifyCoursesChanged,
    }),
    [
      activeCourse,
      availableCourses,
      coursesRevision,
      error,
      isLoading,
      isSaving,
      notifyCoursesChanged,
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
