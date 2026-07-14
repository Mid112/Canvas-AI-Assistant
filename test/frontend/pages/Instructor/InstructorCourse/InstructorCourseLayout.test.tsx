import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";

import { InstructorCourseLayout } from "@/pages/Instructor/InstructorCourse/InstructorCourseLayout";
import { renderWithRouter } from "@test/utils/renderWithRouter";

const mockUseAuth = vi.fn();
const mockUseResolvedInstructorCourse = vi.fn();

vi.mock("@/contexts/AuthContext", async () => {
  const actual = await vi.importActual<typeof import("@/contexts/AuthContext")>(
    "@/contexts/AuthContext",
  );
  return {
    ...actual,
    useAuth: () => mockUseAuth(),
  };
});

vi.mock("@/hooks/useResolvedInstructorCourse", () => ({
  useResolvedInstructorCourse: () => mockUseResolvedInstructorCourse(),
}));

vi.mock("@/hooks/useCourseAssignmentCount", () => ({
  useCourseAssignmentCount: () => null,
}));

function renderLayout(path: string) {
  return renderWithRouter(
    <Routes>
      <Route
        path="/instructor/courses/:localCourseId"
        element={<InstructorCourseLayout />}
      />
    </Routes>,
    {
      routerProps: {
        initialEntries: [path],
      },
    },
  );
}

describe("InstructorCourseLayout", () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      accessToken: "token",
      user: {
        id: 1,
        name: "Dr. Jane Doe",
        role: "instructor",
        has_canvas_token: true,
      },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });
    mockUseResolvedInstructorCourse.mockReturnValue({
      course: null,
      canvasUrl: "https://canvas.example.edu",
      isLoading: false,
      loadError: null,
      needsCanvasConnection: false,
    });
  });

  // #689 / #692 — Course shell error and gate states
  // Verifies: Invalid course IDs show a recoverable error state.
  it("shows an invalid course link state for a non-numeric course id", () => {
    renderLayout("/instructor/courses/not-a-number");

    expect(
      screen.getByRole("heading", { name: "Invalid course link" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Back to courses" }),
    ).toHaveAttribute("href", "/instructor/courses");
  });

  // Verifies: Missing Canvas connection shows the shared gate component.
  it("shows Canvas connection required when the user has no Canvas token", () => {
    mockUseAuth.mockReturnValue({
      accessToken: "token",
      user: {
        id: 1,
        name: "Dr. Jane Doe",
        role: "instructor",
        has_canvas_token: false,
      },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    renderLayout("/instructor/courses/10");

    expect(
      screen.getByRole("heading", { name: "Connect Canvas to continue" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Connect Canvas to view this course."),
    ).toBeInTheDocument();
  });

  // Verifies: Loading state while course details are fetched.
  it("shows a loading state while the course is resolving", () => {
    mockUseResolvedInstructorCourse.mockReturnValue({
      course: null,
      canvasUrl: "https://canvas.example.edu",
      isLoading: true,
      loadError: null,
      needsCanvasConnection: false,
    });

    renderLayout("/instructor/courses/10");

    expect(
      screen.getByRole("heading", { name: "Loading course" }),
    ).toBeInTheDocument();
  });

  // Verifies: Load failures surface the error message with a back link.
  it("shows a load-error state when course resolution fails", () => {
    mockUseResolvedInstructorCourse.mockReturnValue({
      course: null,
      canvasUrl: "https://canvas.example.edu",
      isLoading: false,
      loadError: "Canvas API timed out",
      needsCanvasConnection: false,
    });

    renderLayout("/instructor/courses/10");

    expect(
      screen.getByRole("heading", { name: "Unable to load course" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Canvas API timed out")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Back to courses" }),
    ).toBeInTheDocument();
  });
});
