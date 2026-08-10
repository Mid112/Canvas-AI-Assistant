import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InstructorAnalyticsPage } from "@/pages/Instructor/InstructorAnalyticsPage";
import { paths, instructorCourseAnalyticsPath } from "@/routes/paths";
import { fetchCourseAssignments } from "@/services/assignments";
import { fetchActiveCourse, fetchCachedCourses, fetchCourses } from "@/services/canvas";
import { fetchAssignmentSubmissions } from "@/services/submissions";
import { renderWithInstitution } from "@test/utils/renderWithInstitution";

const analyticsRoutePath = "/instructor/courses/:localCourseId/analytics";

const mockUseAuth = vi.fn();

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

vi.mock("@/services/assignments", () => ({
  AssignmentApiError: class AssignmentApiError extends Error {
    status = 500;
  },
  fetchCourseAssignments: vi.fn(),
}));

vi.mock("@/services/submissions", () => ({
  SubmissionApiError: class SubmissionApiError extends Error {
    status: number;

    constructor(message: string, status = 500) {
      super(message);
      this.status = status;
    }
  },
  fetchAssignmentSubmissions: vi.fn(),
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
const mockedFetchCachedCourses = vi.mocked(fetchCachedCourses);
const mockedFetchActiveCourse = vi.mocked(fetchActiveCourse);
const mockedFetchCourseAssignments = vi.mocked(fetchCourseAssignments);
const mockedFetchAssignmentSubmissions = vi.mocked(fetchAssignmentSubmissions);

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
  },
];

const canvasAssignments = [
  {
    id: 10,
    name: "Programming Assignment 3",
    description: null,
    due_at: null,
    points_possible: 100,
    course_id: 101,
  },
];

function renderAnalyticsPage(
  ui: ReactElement = <InstructorAnalyticsPage />,
  initialEntry = instructorCourseAnalyticsPath(1),
) {
  return renderWithInstitution(
    <Routes>
      <Route path={analyticsRoutePath} element={ui} />
      <Route path={paths.instructor.courses} element={<div>Courses page</div>} />
    </Routes>,
    {
      routerProps: {
        initialEntries: [initialEntry],
      },
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue(authWithCanvas);
  mockedFetchActiveCourse.mockResolvedValue(null);
  mockedFetchCourses.mockResolvedValue(canvasCourses);
  mockedFetchCachedCourses.mockResolvedValue([]);
  mockedFetchCourseAssignments.mockResolvedValue(canvasAssignments);
  mockedFetchAssignmentSubmissions.mockResolvedValue([
    {
      id: 1,
      assignment_id: 10,
      user_id: 501,
      student_name: "Maria Garcia",
      student_email: "maria@example.edu",
      student_login_id: "maria@example.edu",
      submitted_at: null,
      workflow_state: "unsubmitted",
      status: "missing",
      score: null,
      grade: null,
      graded_at: null,
    },
    {
      id: 2,
      assignment_id: 10,
      user_id: 502,
      student_name: "Alex Thompson",
      student_email: "alex@example.edu",
      student_login_id: "alex@example.edu",
      submitted_at: "2026-03-01T12:00:00Z",
      workflow_state: "submitted",
      status: "late",
      score: 8,
      grade: "8",
      graded_at: null,
    },
  ]);
});

describe("InstructorAnalyticsPage", () => {
  // Verifies: Requires Canvas before showing analytics.
  it("requires Canvas before showing analytics", () => {
    mockUseAuth.mockReturnValue(authWithoutCanvas);

    renderAnalyticsPage();

    expect(screen.getByText("Connect Canvas to continue")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Assignment Submission Analytics" }),
    ).not.toBeInTheDocument();
  });

  // Verifies: Renders course-specific submissions analysis from Canvas.
  it("renders course-specific submissions analysis from Canvas", async () => {
    renderAnalyticsPage();

    expect(
      await screen.findByRole("heading", {
        name: "Assignment Submission Analytics",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("CS 101: Introduction to Programming"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Courses" })).toHaveAttribute(
      "href",
      paths.instructor.courses,
    );
    expect(screen.getByLabelText("Search or select assignment")).toBeInTheDocument();
    expect(await screen.findByText("Maria Garcia")).toBeInTheDocument();
    expect(screen.getByText("Alex Thompson")).toBeInTheDocument();
  });

  // Verifies: Shows an error when the course id is not in synced Canvas courses.
  it("shows an error when the course id is not in synced Canvas courses", async () => {
    mockedFetchCourses.mockResolvedValue(canvasCourses);

    renderAnalyticsPage(
      <InstructorAnalyticsPage />,
      instructorCourseAnalyticsPath(999),
    );

    expect(
      await screen.findByText(
        "This course is not available in your synced Canvas courses.",
      ),
    ).toBeInTheDocument();
  });

  // Verifies: Filters students by search query.
  it("filters students by search query", async () => {
    const user = userEvent.setup();

    renderAnalyticsPage();

    await screen.findByText("Maria Garcia");
    await user.type(screen.getByLabelText("Search students"), "Maria");

    expect(screen.getByText("Maria Garcia")).toBeInTheDocument();
    expect(screen.queryByText("Alex Thompson")).not.toBeInTheDocument();
  });

  // Verifies: Shows only missing submissions when filtered by status.
  it("shows only missing submissions when filtered by status", async () => {
    const user = userEvent.setup();

    renderAnalyticsPage();

    await screen.findByText("Maria Garcia");
    await user.selectOptions(
      screen.getByLabelText("Filter by Status"),
      "missing",
    );

    expect(
      screen.getByRole("heading", { name: "Missing Submissions" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Late Submissions" }),
    ).not.toBeInTheDocument();
  });
});
