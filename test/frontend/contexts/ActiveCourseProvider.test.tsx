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
  fetchActiveCourse: vi.fn(),
  setActiveCourse: vi.fn(),
}));

const mockUseAuth = vi.fn();
const mockedFetchCourses = vi.mocked(fetchCourses);
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

const CANVAS_URL = "https://canvas.ubc.ca";

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
});
