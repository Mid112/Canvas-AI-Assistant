import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { useCanvasInstructorCourses } from "@/pages/Instructor/InstructorCourses/useCanvasInstructorCourses";
import { fetchCourseAssignments } from "@/services/assignments";
import type { InstructorCourse } from "@/types/course";

const mockUseAuth = vi.fn();
const mockUseActiveCourse = vi.fn();
const mockUseCanvasConnectionUrl = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));
vi.mock("@/contexts/useActiveCourse", () => ({
  useActiveCourse: () => mockUseActiveCourse(),
}));
vi.mock("@/hooks/useCanvasConnectionUrl", () => ({
  useCanvasConnectionUrl: () => mockUseCanvasConnectionUrl(),
}));
vi.mock("@/services/assignments", () => ({
  fetchCourseAssignments: vi.fn(),
}));

function makeCourse(overrides: Partial<InstructorCourse> = {}): InstructorCourse {
  return {
    id: 1,
    code: "COSC 310",
    name: "COSC 310",
    progress: 0,
    studentCount: 0,
    assignmentCount: 0,
    lastActivity: "",
    isPublished: true,
    isWritable: true,
    term: null,
    ...overrides,
  };
}

describe("useCanvasInstructorCourses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      accessToken: "token",
      user: { has_canvas_token: true },
    });
    mockUseActiveCourse.mockReturnValue({
      availableCourses: [],
      isLoading: false,
      isLoaded: true,
      error: null,
      needsCanvasConnection: false,
      refreshActiveCourse: vi.fn(),
    });
  });

  // Verifies: Does not fetch assignment counts when there is no resolved Canvas URL.
  it("skips assignment-count fetches when canvasUrl is unresolved", async () => {
    mockUseCanvasConnectionUrl.mockReturnValue(undefined);
    mockUseActiveCourse.mockReturnValue({
      availableCourses: [makeCourse()],
      isLoading: false,
      isLoaded: true,
      error: null,
      needsCanvasConnection: false,
      refreshActiveCourse: vi.fn(),
    });

    renderHook(() => useCanvasInstructorCourses());

    await waitFor(() => {
      expect(fetchCourseAssignments).not.toHaveBeenCalled();
    });
  });

  // Verifies: Stale per-course assignment counts are cleared once the course list empties out.
  it("clears assignment counts when availableCourses becomes empty", async () => {
    mockUseCanvasConnectionUrl.mockReturnValue("https://canvas.ubc.ca");
    vi.mocked(fetchCourseAssignments).mockResolvedValue([{ id: 1 } as never]);

    mockUseActiveCourse.mockReturnValue({
      availableCourses: [makeCourse({ id: 5 })],
      isLoading: false,
      isLoaded: true,
      error: null,
      needsCanvasConnection: false,
      refreshActiveCourse: vi.fn(),
    });

    const { result, rerender } = renderHook(() => useCanvasInstructorCourses());

    await waitFor(() => {
      expect(result.current.courses[0]?.assignmentCount).toBe(1);
    });

    mockUseActiveCourse.mockReturnValue({
      availableCourses: [],
      isLoading: false,
      isLoaded: true,
      error: null,
      needsCanvasConnection: false,
      refreshActiveCourse: vi.fn(),
    });
    rerender();

    await waitFor(() => {
      expect(result.current.courses).toHaveLength(0);
    });
  });
});
