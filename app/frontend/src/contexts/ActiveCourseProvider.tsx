// Context note: shares active course provider state across route trees without prop-drilling.

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
  fetchCachedCourses,
  fetchCourses,
  setActiveCourse as persistActiveCourse,
} from "@/services/canvas";
import type { ActiveCourseResponse, CanvasCourse } from "@/types/canvas";
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

function mapCoursesList(
  canvasCourses: CanvasCourse[],
  canvasUrl: string,
): InstructorCourse[] {
  return canvasCourses
    .map((canvasCourse) => mapCanvasCourseToInstructorCourse(canvasCourse, canvasUrl))
    .filter((course): course is InstructorCourse => course !== null);
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
  const { accessToken, user, logout } = useAuth();
  const { selectedInstitution } = useInstitution();
  const [activeCourse, setActiveCourseState] = useState<ActiveCourseSelection | null>(
    null,
  );
  const [availableCourses, setAvailableCourses] = useState<InstructorCourse[]>([]);
  const [coursesRevision, setCoursesRevision] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsCanvasConnection, setNeedsCanvasConnection] = useState(false);
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
  const canvasUrl = resolveCanvasApiUrl(user, selectedInstitution.id);
  const persistenceScope = user
    ? String(user.id)
    : `institution-${selectedInstitution.id}`;

  const resolveStoredActiveCourse = useCallback(
    (courses: InstructorCourse[]): ActiveCourseSelection | null => {
      const stored = getStoredActiveCourseSelection(persistenceScope);
      const storedId = stored?.localId ?? null;
      // isPublished check matters here: a stale local-storage selection can point
      // at a course that flipped unpublished since it was cached.
      const matched = courses.find(
        (course) => course.id === storedId && course.isPublished,
      );
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
        // Only adopt the preferred course if it's still selectable — otherwise fall
        // through to the stored selection rather than re-displaying/re-selecting a
        // course the backend has already decided is no longer the active one (e.g.
        // it just flipped unpublished, or a fresh serverActive read raced ahead of
        // that flip being reflected server-side — see refreshActiveCourse below).
        if (preferred && preferred.isPublished) {
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
      setNeedsCanvasConnection(false);
      // Hydrate from local storage before any Canvas request so navigation to
      // the assistant can display and use the chosen course immediately.
      setActiveCourseState(getStoredActiveCourseSelection(persistenceScope));
    }

    let cachePainted = false;
    try {
      if (usesCanvasCourses && accessToken) {
        const serverActive = await fetchActiveCourse(accessToken).catch(() => null);
        if (isMountedRef.current && serverActive) {
          setActiveCourseState(toActiveCourseSelectionFromResponse(serverActive));
        }

        if (!canvasUrl) {
          if (isMountedRef.current) {
            setAvailableCourses([]);
            setNeedsCanvasConnection(true);
            if (!serverActive) {
              setActiveCourseState(null);
            }
          }
          return;
        }

        // Paint from whatever was last synced to the local DB before making
        // the user wait on a live Canvas round-trip — the live fetch below
        // still runs afterward to revalidate in the background. A cache-read
        // failure, or an instructor with nothing synced yet, is treated the
        // same as "nothing to paint" and falls straight through to today's
        // behavior of blocking on the live fetch.
        const cached = await fetchCachedCourses(accessToken, canvasUrl).catch(() => []);
        if (cached.length > 0) {
          const cachedCourses = mapCoursesList(cached, canvasUrl);
          const selectedFromCache = applyActiveCourseFromList(
            cachedCourses,
            serverActive?.local_id ?? getStoredActiveCourseId(persistenceScope),
          );
          if (isMountedRef.current) {
            setAvailableCourses(cachedCourses);
            setActiveCourseState(
              selectedFromCache ?? getStoredActiveCourseSelection(persistenceScope),
            );
            setIsLoading(false);
            setIsLoaded(true);
            cachePainted = true;
          }
        }

        const coursesData = await fetchCoursesWithTimeout(accessToken, canvasUrl);

        const courses = mapCoursesList(coursesData, canvasUrl);
        const selectedFromList = applyActiveCourseFromList(
          courses,
          serverActive?.local_id ?? getStoredActiveCourseId(persistenceScope),
        );
        // serverActive was fetched before this course-list sync, so it can be stale
        // if this course just flipped unpublished (the backend clears the
        // preference as part of the course-list sync we just awaited, not before
        // it) — only trust it as a fallback if the freshly-fetched list still
        // agrees this course is selectable.
        const serverActiveStillSelectable = Boolean(
          serverActive &&
            courses.some(
              (course) => course.id === serverActive.local_id && course.isPublished,
            ),
        );

        if (isMountedRef.current) {
          setAvailableCourses(courses);
          setActiveCourseState(
            selectedFromList ??
              (serverActiveStillSelectable && serverActive
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
          setNeedsCanvasConnection(true);
        }
        return;
      }

      if (err instanceof CanvasApiError && err.status === 401) {
        logout();
        return;
      }

      // A cache paint already succeeded above, so this is a failed background
      // revalidation, not an initial load failure — leave the last-known
      // (cached) data on screen instead of clearing it or showing an error.
      if (cachePainted) {
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
        setIsLoaded(true);
      }
    }
  }, [
    accessToken,
    applyActiveCourseFromList,
    canvasUrl,
    logout,
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
      isLoaded,
      isSaving,
      error,
      needsCanvasConnection,
      selectActiveCourse,
      refreshActiveCourse,
      notifyCoursesChanged,
    }),
    [
      activeCourse,
      availableCourses,
      coursesRevision,
      error,
      isLoaded,
      isLoading,
      isSaving,
      needsCanvasConnection,
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
