import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";

import { InstructorCourseSubmissionsPage } from "@/pages/Instructor/InstructorCourseSubmissionsPage";
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

vi.mock("@/services/assignments", () => ({
  AssignmentApiError: class AssignmentApiError extends Error {
    name = "AssignmentApiError";
  },
  fetchAssignment: vi.fn(),
}));

vi.mock("@/services/submissions", () => ({
  SubmissionApiError: class SubmissionApiError extends Error {
    name = "SubmissionApiError";
  },
  fetchAssignmentSubmissions: vi.fn(),
}));

function renderPage(path: string) {
  return renderWithRouter(
    <Routes>
      <Route
        path="/instructor/courses/:localCourseId/assignments/:assignmentId/submissions"
        element={<InstructorCourseSubmissionsPage />}
      />
    </Routes>,
    {
      routerProps: {
        initialEntries: [path],
      },
    },
  );
}

describe("InstructorCourseSubmissionsPage", () => {
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
      course: {
        id: 10,
        name: "Capstone",
        code: "COSC 499",
      },
      canvasUrl: "https://canvas.example.edu",
      isLoading: false,
      loadError: null,
      needsCanvasConnection: false,
    });
  });

  // #689 / #692 — Submissions page gates and invalid links
  // Verifies: Invalid route params show a recoverable invalid-link state.
  it("shows an invalid link state for non-numeric ids", () => {
    renderPage("/instructor/courses/abc/assignments/xyz/submissions");

    expect(
      screen.getByRole("heading", { name: "Invalid assignment link" }),
    ).toBeInTheDocument();
  });

  // Verifies: Missing Canvas connection shows the shared gate.
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

    renderPage("/instructor/courses/10/assignments/3/submissions");

    expect(
      screen.getByRole("heading", { name: "Connect Canvas to continue" }),
    ).toBeInTheDocument();
  });
});
