import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Route, Routes } from "react-router-dom";

import { InstructorCourseAssignmentsPage } from "@/pages/Instructor/InstructorCourseAssignmentsPage";
import { fetchCourseAssignments } from "@/services/assignments";
import { fetchCourses } from "@/services/canvas";
import { renderWithInstitution } from "@test/utils/renderWithInstitution";

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

vi.mock("@/services/assignments", () => ({
  AssignmentApiError: class AssignmentApiError extends Error {
    status = 500;
  },
  fetchCourseAssignments: vi.fn(),
}));

const mockUseAuth = vi.fn();
const mockedFetchCourseAssignments = vi.mocked(fetchCourseAssignments);
const mockedFetchCourses = vi.mocked(fetchCourses);

vi.mock("@/contexts/AuthContext", async () => {
  const actual = await vi.importActual<typeof import("@/contexts/AuthContext")>(
    "@/contexts/AuthContext",
  );

  return {
    ...actual,
    useAuth: () => mockUseAuth(),
  };
});

const CANVAS_URL = "http://localhost:3000";

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

function renderPage(localCourseId = "3") {
  return renderWithInstitution(
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
    mockedFetchCourses.mockResolvedValue([
      {
        canvas_id: 99,
        local_id: 3,
        name: "Introduction to Programming",
        course_code: "CS 101",
        workflow_state: "available",
        total_students: 45,
      },
    ]);
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

  // Verifies: Loads assignments and links to the edit page.
  it("loads assignments and links to the edit page", async () => {
    renderPage();

    expect(screen.getByText("Loading assignments")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Lab 1")).toBeInTheDocument();
    });

    expect(mockedFetchCourseAssignments).toHaveBeenCalledWith(
      3,
      "token",
      CANVAS_URL,
    );

    const editLink = screen.getByRole("button", { name: "Edit" });
    expect(editLink).toHaveAttribute(
      "href",
      "/instructor/courses/3/assignments/10/edit",
    );
  });

  // Verifies: Shows connect Canvas prompt when no token is linked.
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
