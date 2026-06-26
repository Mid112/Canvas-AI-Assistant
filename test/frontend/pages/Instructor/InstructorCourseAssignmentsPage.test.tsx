import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Route, Routes } from "react-router-dom";

import { InstructorCourseAssignmentsPage } from "@/pages/Instructor/InstructorCourseAssignmentsPage";
import { fetchCourseAssignments } from "@/services/assignments";
import { renderWithRouter } from "@test/utils/renderWithRouter";

vi.mock("@/services/assignments", () => ({
  AssignmentApiError: class AssignmentApiError extends Error {
    status = 500;
  },
  fetchCourseAssignments: vi.fn(),
}));

const mockUseAuth = vi.fn();

vi.mock("@/contexts/AuthContext", async () => {
  const actual = await vi.importActual<typeof import("@/contexts/AuthContext")>(
    "@/contexts/AuthContext",
  );

  return {
    ...actual,
    useAuth: () => mockUseAuth(),
  };
});

const mockedFetchCourseAssignments = vi.mocked(fetchCourseAssignments);

const authWithCanvas = {
  user: {
    id: 1,
    email: "instructor@example.com",
    name: "Dr. Jane Doe",
    role: "instructor",
    is_active: true,
    has_canvas_token: true,
  },
  accessToken: "token",
  isAuthenticated: true,
  isLoading: false,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
};

function renderPage(localCourseId = "3") {
  return renderWithRouter(
    <Routes>
      <Route
        path="/instructor/courses/:localCourseId/assignments"
        element={<InstructorCourseAssignmentsPage />}
      />
    </Routes>,
    {
      routerProps: {
        initialEntries: [`/instructor/courses/${localCourseId}/assignments`],
      },
    },
  );
}

describe("InstructorCourseAssignmentsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue(authWithCanvas);
    mockedFetchCourseAssignments.mockResolvedValue([
      {
        id: 10,
        name: "Lab 1",
        description: "Complete the lab.",
        due_at: "2026-12-15T12:00:00.000Z",
        points_possible: 50,
        course_id: 99,
      },
    ]);
  });

  it("loads assignments and links to the edit page", async () => {
    renderPage();

    expect(screen.getByText("Loading assignments")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Lab 1")).toBeInTheDocument();
    });

    expect(mockedFetchCourseAssignments).toHaveBeenCalledWith(3, "token");

    const editLink = screen.getByRole("link", { name: "Edit" });
    expect(editLink).toHaveAttribute(
      "href",
      "/instructor/courses/3/assignments/10/edit",
    );
  });

  it("shows connect Canvas prompt when no token is linked", async () => {
    mockUseAuth.mockReturnValue({
      ...authWithCanvas,
      user: {
        ...authWithCanvas.user,
        has_canvas_token: false,
      },
    });

    renderPage();

    expect(
      await screen.findByText("Connect Canvas to continue"),
    ).toBeInTheDocument();
    expect(mockedFetchCourseAssignments).not.toHaveBeenCalled();
  });
});
