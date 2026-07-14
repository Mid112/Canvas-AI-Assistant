import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InstructorDashboardPage } from "@/pages/Instructor/InstructorDashboardPage";
import { paths } from "@/routes/paths";
import { fetchCourseAssignments } from "@/services/assignments";
import { fetchActiveCourse, fetchCourses } from "@/services/canvas";
import { renderWithInstitution } from "@test/utils/renderWithInstitution";

const mockNavigate = vi.fn();
const mockUseAuth = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

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

vi.mock("@/contexts/AuthContext", async () => {
  const actual = await vi.importActual<typeof import("@/contexts/AuthContext")>(
    "@/contexts/AuthContext",
  );

  return {
    ...actual,
    useAuth: () => mockUseAuth(),
  };
});

const mockedFetchCourses = vi.mocked(fetchCourses);
const mockedFetchActiveCourse = vi.mocked(fetchActiveCourse);
const mockedFetchCourseAssignments = vi.mocked(fetchCourseAssignments);

const CANVAS_URL = "https://canvas.ubc.ca";

const authWithCanvas = {
  user: {
    id: 1,
    email: "jane.doe@example.com",
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
  {
    canvas_id: 102,
    local_id: 2,
    name: "Data Structures",
    course_code: "CS 201",
    workflow_state: "available",
    total_students: 38,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue(authWithCanvas);
  mockedFetchActiveCourse.mockResolvedValue(null);
  mockedFetchCourses.mockResolvedValue(canvasCourses);
  mockedFetchCourseAssignments.mockResolvedValue([
    { id: 1, name: "Assignment 1", course_id: 101 },
  ]);
});

describe("InstructorDashboardPage", () => {
  // Verifies: Requires Canvas before showing dashboard content.
  it("requires Canvas before showing dashboard content", () => {
    mockUseAuth.mockReturnValue(authWithoutCanvas);

    renderWithInstitution(<InstructorDashboardPage />);

    expect(screen.getByText("Connect Canvas to continue")).toBeInTheDocument();
    expect(screen.queryByText("Total Students")).not.toBeInTheDocument();
    expect(screen.queryByText("Quick AI Actions")).not.toBeInTheDocument();
  });

  // Verifies: Renders Canvas-derived dashboard data.
  it("renders Canvas-derived dashboard data", async () => {
    renderWithInstitution(<InstructorDashboardPage />);

    expect(
      screen.getByRole("heading", { name: "Dashboard" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Welcome back, Dr. Jane Doe. Overview for canvas.ubc.ca."),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("CS 101: Introduction to Programming")).toBeInTheDocument();
    });

    expect(screen.getByText("Total Students")).toBeInTheDocument();
    expect(screen.getByText("83")).toBeInTheDocument();
    expect(screen.getByText("Quick AI Actions")).toBeInTheDocument();
    expect(screen.queryByText("Recent Activity")).not.toBeInTheDocument();
    expect(screen.queryByText("Notifications")).not.toBeInTheDocument();
  });

  // Verifies: Navigates to the assistant from the dashboard CTA.
  it("navigates to the assistant from the dashboard CTA", async () => {
    const user = userEvent.setup();
    mockNavigate.mockClear();

    renderWithInstitution(<InstructorDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Quick AI Actions")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Open AI Assistant" }));
    expect(mockNavigate).toHaveBeenCalledWith(paths.instructor.assistant);
  });
});
