import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ActiveCourseProvider } from "@/contexts/ActiveCourseProvider";
import { AuthProvider } from "@/contexts/AuthContext";
import { InstitutionProvider } from "@/contexts/InstitutionProvider";
import { useActiveCourse } from "@/contexts/useActiveCourse";
import { getInstitutionData } from "@/data/institutionCourseData";
import { setStoredActiveCourseSelection } from "@/lib/active-course-storage";
import {
  fetchActiveCourse,
  fetchCachedCourses,
  fetchCourses,
  setActiveCourse,
} from "@/services/canvas";

vi.mock("@/services/canvas", () => ({
  CanvasApiError: class CanvasApiError extends Error {
    status: number;

    constructor(message: string, status = 500) {
      super(message);
      this.status = status;
    }
  },
  fetchCourses: vi.fn(),
  fetchCachedCourses: vi.fn(),
  fetchActiveCourse: vi.fn(),
  setActiveCourse: vi.fn(),
}));

const mockUseAuth = vi.fn();
const mockedFetchCourses = vi.mocked(fetchCourses);
const mockedFetchCachedCourses = vi.mocked(fetchCachedCourses);
const mockedFetchActiveCourse = vi.mocked(fetchActiveCourse);
const mockedSetActiveCourse = vi.mocked(setActiveCourse);

vi.mock("@/contexts/AuthContext", async () => {
  const actual = await vi.importActual<typeof import("@/contexts/AuthContext")>(
    "@/contexts/AuthContext",
  );

  return {
    ...actual,
    useAuth: () => mockUseAuth(),
  };
});

const CANVAS_URL = "https://canvas.example.edu";

const authWithCanvas = {
  user: {
    id: 1,
    email: "instructor@example.com",
    name: "Dr. Jane Doe",
    role: "instructor",
    is_active: true,
    has_canvas_token: true,
    canvas_connections: [
      {
        id: 1,
        canvas_url: CANVAS_URL,
        created_at: "2026-06-26T00:00:00.000Z",
      },
    ],
  },
  accessToken: "token",
  isAuthenticated: true,
  isLoading: false,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  refreshUser: vi.fn(),
};

const authWithoutCanvas = {
  ...authWithCanvas,
  user: { ...authWithCanvas.user, has_canvas_token: false, canvas_connections: [] },
};

const canvasCourses = [
  {
    canvas_id: 101,
    local_id: 1,
    name: "Introduction to Programming",
    course_code: "CS 101",
    workflow_state: "available",
    total_students: 45,
    term_name: null,
  },
];

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <InstitutionProvider>
        <ActiveCourseProvider>{children}</ActiveCourseProvider>
      </InstitutionProvider>
    </AuthProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue(authWithCanvas);
  mockedFetchCourses.mockResolvedValue(canvasCourses);
  // Default: nothing cached yet, so every existing test below (written before
  // the cache-paint step existed) falls straight through to the live fetch —
  // today's exact original behavior.
  mockedFetchCachedCourses.mockResolvedValue([]);
  mockedFetchActiveCourse.mockResolvedValue(null);
  mockedSetActiveCourse.mockResolvedValue({
    local_id: 1,
    canvas_course_id: "101",
    canvas_url: CANVAS_URL,
    name: "Introduction to Programming",
    term: null,
  });
});

describe("ActiveCourseProvider", () => {
  // Verifies: Clears courses when Canvas is disconnected.
  it("clears courses when Canvas is disconnected", async () => {
    mockUseAuth.mockReturnValue(authWithoutCanvas);

    const { result } = renderHook(() => useActiveCourse(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.availableCourses).toEqual([]);
    expect(mockedFetchCourses).not.toHaveBeenCalled();
  });

  // Verifies: Loads Canvas courses when connected.
  it("loads Canvas courses when connected", async () => {
    const { result } = renderHook(() => useActiveCourse(), { wrapper });

    await waitFor(() => {
      expect(result.current.availableCourses).toHaveLength(1);
    });

    expect(result.current.availableCourses[0]?.code).toBe("CS 101");
    expect(result.current.error).toBeNull();
  });

  // Verifies: Does not fall back to mock courses when Canvas returns no courses.
  it("does not fall back to mock courses when Canvas returns no courses", async () => {
    mockedFetchCourses.mockResolvedValue([]);

    const { result } = renderHook(() => useActiveCourse(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.availableCourses).toEqual([]);
    expect(result.current.activeCourse).toBeNull();
    expect(result.current.error).toBeNull();
  });

  // Verifies: Does not fall back to mock courses when Canvas fetch fails.
  it("does not fall back to mock courses when Canvas fetch fails", async () => {
    const { CanvasApiError } = await import("@/services/canvas");
    mockedFetchCourses.mockRejectedValue(
      new CanvasApiError("Canvas unavailable", 503),
    );

    const { result } = renderHook(() => useActiveCourse(), { wrapper });

    await waitFor(() => {
      expect(result.current.error).toBe("Canvas unavailable");
    });

    expect(result.current.availableCourses).toEqual([]);
    expect(result.current.activeCourse).toBeNull();
    expect(
      result.current.availableCourses.some(
        (course) => course.code === getInstitutionData("ubc")!.courses[0]?.code,
      ),
    ).toBe(false);
  });

  // Verifies: Keeps the saved active course when Canvas course sync fails.
  it("keeps the saved active course when Canvas course sync fails", async () => {
    const { CanvasApiError } = await import("@/services/canvas");
    mockedFetchActiveCourse.mockResolvedValue({
      local_id: 99,
      canvas_course_id: "499",
      canvas_url: CANVAS_URL,
      name: "COSC 499",
      term: null,
    });
    mockedFetchCourses.mockRejectedValue(
      new CanvasApiError("Canvas unavailable", 503),
    );

    const { result } = renderHook(() => useActiveCourse(), { wrapper });

    await waitFor(() => {
      expect(result.current.activeCourse).toEqual({
        localId: 99,
        displayName: "COSC 499",
      });
    });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.availableCourses).toEqual([]);
    expect(result.current.error).toBe("Canvas unavailable");
  });

  // Verifies: Hydrates the saved active course before Canvas finishes loading.
  it("hydrates the saved active course before Canvas finishes loading", async () => {
    setStoredActiveCourseSelection("1", {
      localId: 499,
      displayName: "COSC 499",
    });
    mockedFetchActiveCourse.mockReturnValue(new Promise(() => undefined));

    const { result } = renderHook(() => useActiveCourse(), { wrapper });

    await waitFor(() => {
      expect(result.current.activeCourse).toEqual({
        localId: 499,
        displayName: "COSC 499",
      });
    });
    expect(result.current.isLoading).toBe(true);
  });

  // Verifies: Uses the backend response when the provider course cache is stale.
  it("uses the backend response when the provider course cache is stale", async () => {
    mockedFetchCourses.mockResolvedValue([]);
    mockedSetActiveCourse.mockResolvedValue({
      local_id: 99,
      canvas_course_id: "499",
      canvas_url: CANVAS_URL,
      name: "COSC 499",
      term: null,
    });

    const { result } = renderHook(() => useActiveCourse(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.selectActiveCourse(99);
    });

    expect(mockedSetActiveCourse).toHaveBeenCalledWith(99, "token");
    expect(result.current.activeCourse).toEqual({
      localId: 99,
      displayName: "COSC 499",
    });
    expect(result.current.error).toBeNull();
  });

  it("sets isLoaded once the first fetch completes and keeps it true on refresh", async () => {
    const { result } = renderHook(() => useActiveCourse(), { wrapper });

    expect(result.current.isLoaded).toBe(false);

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    await act(async () => {
      await result.current.refreshActiveCourse();
    });

    expect(result.current.isLoaded).toBe(true);
  });

  it("leaves needsCanvasConnection false when the user has never connected Canvas at all", async () => {
    // That case is checked directly via user.has_canvas_token by every
    // consuming page (see InstructorCoursesPage.tsx) — needsCanvasConnection
    // here is specifically for "connected, but this institution's Canvas URL
    // couldn't be resolved" or "reconnect required" (see the tests below).
    mockUseAuth.mockReturnValue(authWithoutCanvas);

    const { result } = renderHook(() => useActiveCourse(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.needsCanvasConnection).toBe(false);
  });

  it("flags needsCanvasConnection when the course fetch fails with a reconnect error", async () => {
    const { CanvasApiError } = await import("@/services/canvas");
    mockedFetchCourses.mockRejectedValue(
      new CanvasApiError("Invalid Canvas API token", 422),
    );

    const { result } = renderHook(() => useActiveCourse(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.needsCanvasConnection).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it("logs out when the course fetch fails with a 401", async () => {
    const { CanvasApiError } = await import("@/services/canvas");
    mockedFetchCourses.mockRejectedValue(new CanvasApiError("Unauthorized", 401));

    const { result } = renderHook(() => useActiveCourse(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(authWithCanvas.logout).toHaveBeenCalled();
  });

  // Verifies: A course that flipped unpublished since the last active-course read
  // is never (re-)adopted as the resolved active course, even though
  // fetchActiveCourse's response was read before this course-list sync — the
  // race that previously let the frontend re-select a course the backend had
  // just rejected/cleared.
  it("does not adopt a course as active if it has since flipped unpublished", async () => {
    mockedFetchActiveCourse.mockResolvedValue({
      local_id: 1,
      canvas_course_id: "101",
      canvas_url: CANVAS_URL,
      name: "Introduction to Programming",
      term: null,
    });
    mockedFetchCourses.mockResolvedValue([
      { ...canvasCourses[0]!, workflow_state: "unpublished" },
    ]);

    const { result } = renderHook(() => useActiveCourse(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.activeCourse).toBeNull();
  });

  // Verifies: A stale local-storage selection pointing at a now-unpublished
  // course is not resolved as active either.
  it("does not adopt a stored active-course selection if it has since flipped unpublished", async () => {
    setStoredActiveCourseSelection("1", {
      localId: 1,
      displayName: "Introduction to Programming",
    });
    mockedFetchActiveCourse.mockResolvedValue(null);
    mockedFetchCourses.mockResolvedValue([
      { ...canvasCourses[0]!, workflow_state: "unpublished" },
    ]);

    const { result } = renderHook(() => useActiveCourse(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.activeCourse).toBeNull();
  });

  // Verifies: A still-published course is adopted as active normally (no
  // over-correction from the isPublished gating above).
  it("still adopts a published course as active", async () => {
    mockedFetchActiveCourse.mockResolvedValue({
      local_id: 1,
      canvas_course_id: "101",
      canvas_url: CANVAS_URL,
      name: "Introduction to Programming",
      term: null,
    });

    const { result } = renderHook(() => useActiveCourse(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.activeCourse).toEqual({
      localId: 1,
      displayName: "CS 101: Introduction to Programming",
    });
  });

  // ---------------------------------------------------------------------
  // Stale-while-revalidate: cache paint + background live revalidation
  // ---------------------------------------------------------------------

  it("paints available courses from the cache before the live fetch resolves", async () => {
    mockedFetchCachedCourses.mockResolvedValue(canvasCourses);
    mockedFetchCourses.mockReturnValue(new Promise(() => undefined));

    const { result } = renderHook(() => useActiveCourse(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isLoaded).toBe(true);
    expect(result.current.availableCourses).toHaveLength(1);
    expect(result.current.availableCourses[0]?.code).toBe("CS 101");
  });

  it("replaces cached course data once the live revalidation resolves", async () => {
    const cachedCourse = { ...canvasCourses[0]!, name: "Stale Cached Name" };
    const liveCourse = { ...canvasCourses[0]!, name: "Fresh Live Name" };
    mockedFetchCachedCourses.mockResolvedValue([cachedCourse]);
    let resolveLiveFetch: (courses: typeof canvasCourses) => void = () => undefined;
    mockedFetchCourses.mockReturnValue(
      new Promise((resolve) => {
        resolveLiveFetch = resolve;
      }),
    );

    const { result } = renderHook(() => useActiveCourse(), { wrapper });

    await waitFor(() => {
      expect(result.current.availableCourses[0]?.name).toBe("Stale Cached Name");
    });
    expect(result.current.isLoading).toBe(false);

    await act(async () => {
      resolveLiveFetch([liveCourse]);
    });

    await waitFor(() => {
      expect(result.current.availableCourses[0]?.name).toBe("Fresh Live Name");
    });
  });

  it("blocks on the live fetch exactly as before when nothing is cached yet", async () => {
    mockedFetchCachedCourses.mockResolvedValue([]);
    let resolveLiveFetch: (courses: typeof canvasCourses) => void = () => undefined;
    mockedFetchCourses.mockReturnValue(
      new Promise((resolve) => {
        resolveLiveFetch = resolve;
      }),
    );

    const { result } = renderHook(() => useActiveCourse(), { wrapper });

    await waitFor(() => {
      expect(mockedFetchCachedCourses).toHaveBeenCalled();
    });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.availableCourses).toEqual([]);

    await act(async () => {
      resolveLiveFetch(canvasCourses);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.availableCourses).toHaveLength(1);
  });

  it("keeps last-known cached data on screen when the live revalidation fails after a successful cache paint", async () => {
    const { CanvasApiError } = await import("@/services/canvas");
    mockedFetchCachedCourses.mockResolvedValue(canvasCourses);
    mockedFetchCourses.mockRejectedValue(
      new CanvasApiError("Canvas unavailable", 503),
    );

    const { result } = renderHook(() => useActiveCourse(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.availableCourses).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it("falls through to the live fetch when the cache read itself fails", async () => {
    mockedFetchCachedCourses.mockRejectedValue(new Error("cache read failed"));

    const { result } = renderHook(() => useActiveCourse(), { wrapper });

    await waitFor(() => {
      expect(result.current.availableCourses).toHaveLength(1);
    });

    expect(result.current.availableCourses[0]?.code).toBe("CS 101");
    expect(result.current.error).toBeNull();
  });
});
