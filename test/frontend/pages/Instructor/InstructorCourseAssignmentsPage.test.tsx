// Test note: covers the instructor course assignments page.test behavior so future changes can preserve the expected Canvas workflow contract.

import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Route, Routes, useLocation } from "react-router-dom";

import { InstructorCourseAssignmentsPage } from "@/pages/Instructor/InstructorCourseAssignmentsPage";
import {
  AssignmentApiError,
  fetchCourseAssignments,
  setAssignmentPublished,
} from "@/services/assignments";
import { fetchActiveCourse, fetchCachedCourses, fetchCourses } from "@/services/canvas";
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
  fetchCachedCourses: vi.fn(),
  fetchActiveCourse: vi.fn(),
  setActiveCourse: vi.fn(),
}));

vi.mock("@/services/assignments", () => ({
  AssignmentApiError: class AssignmentApiError extends Error {
    status: number;

    constructor(message: string, status = 500) {
      super(message);
      this.status = status;
    }
  },
  fetchCourseAssignments: vi.fn(),
  setAssignmentPublished: vi.fn(),
}));

const mockUseAuth = vi.fn();
const mockedFetchCourseAssignments = vi.mocked(fetchCourseAssignments);
const mockedSetAssignmentPublished = vi.mocked(setAssignmentPublished);
const mockedFetchCourses = vi.mocked(fetchCourses);
const mockedFetchCachedCourses = vi.mocked(fetchCachedCourses);
const mockedFetchActiveCourse = vi.mocked(fetchActiveCourse);

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
// ActiveCourseProvider receives raw Canvas course payloads and maps them to the
// frontend InstructorCourse shape internally, so these fixtures intentionally
// use backend field names instead of the mapped UI field names.
const syncedCanvasCourse = {
  canvas_id: 99,
  local_id: 3,
  name: "Introduction to Programming",
  course_code: "CS 101",
  workflow_state: "available",
  total_students: 45,
  term_name: null,
};

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

function AssignmentCreateLocationProbe() {
  const location = useLocation();
  return <pre data-testid="assignment-create-state">{JSON.stringify(location.state)}</pre>;
}

function renderPage(localCourseId = "3") {
  return renderWithInstitution(
    <Routes>
      <Route
        path="/instructor/courses/:localCourseId/assignments"
        element={<InstructorCourseAssignmentsPage />}
      />
      <Route
        path="/instructor/assignments/create"
        element={<AssignmentCreateLocationProbe />}
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
    mockedFetchActiveCourse.mockResolvedValue(null);
    mockedFetchCourses.mockResolvedValue([syncedCanvasCourse]);
    mockedFetchCachedCourses.mockResolvedValue([syncedCanvasCourse]);
    mockedFetchCourseAssignments.mockResolvedValue([
      {
        id: 10,
        name: "Lab 1",
        description: "Complete the lab.",
        due_at: "2026-12-15T12:00:00.000Z",
        points_possible: 50,
        course_id: 99,
        published: true,
      },
    ]);
  });

  // Verifies: Loads assignments and exposes one course-aware create action in
  // the tab header instead of repeating it for every assignment row.
  it("loads assignments and links to the edit page", async () => {
    const user = userEvent.setup();
    // Not asserting the "Loading assignments" state synchronously here: the
    // shared course list (ActiveCourseProvider) resolving before this page's
    // own assignment fetch can start means the exact loading-state timing is
    // now an implementation detail rather than something reliable to assert
    // on immediately after render — the behavior below is what matters.
    renderPage();

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

    expect(
      screen.getByRole("button", { name: "Unpublish" }),
    ).toBeInTheDocument();

    const createLinks = screen.getAllByRole("button", {
      name: "Create assignment",
    });
    expect(createLinks).toHaveLength(1);
    const createLink = createLinks[0]!;
    expect(createLink).toHaveAttribute(
      "href",
      "/instructor/assignments/create",
    );

    await user.click(createLink);
    expect(screen.getByTestId("assignment-create-state")).toHaveTextContent(
      '"courseId":3',
    );
  });

  // Verifies: Publish/Unpublish toggles Canvas state and refreshes the row badge.
  it("publishes an unpublished assignment and refreshes the badge", async () => {
    const user = userEvent.setup();
    mockedFetchCourseAssignments.mockResolvedValue([
      {
        id: 10,
        name: "Lab 1",
        description: "Complete the lab.",
        due_at: "2026-12-15T12:00:00.000Z",
        points_possible: 50,
        course_id: 99,
        published: false,
      },
    ]);
    mockedSetAssignmentPublished.mockResolvedValue({
      id: 10,
      name: "Lab 1",
      description: "Complete the lab.",
      due_at: "2026-12-15T12:00:00.000Z",
      points_possible: 50,
      course_id: 99,
      published: true,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Unpublished")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => {
      expect(mockedSetAssignmentPublished).toHaveBeenCalledWith(
        3,
        10,
        true,
        "token",
        CANVAS_URL,
      );
    });

    await waitFor(() => {
      expect(screen.queryByText("Unpublished")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Unpublish" })).toBeInTheDocument();
    });
  });

  // Verifies: Canvas unpublish refusals are shown to the instructor.
  it("shows Canvas unpublish refusal errors", async () => {
    const user = userEvent.setup();
    mockedSetAssignmentPublished.mockRejectedValue(
      new AssignmentApiError(
        "Canvas refused to unpublish this assignment. Canvas API error: 400 - Can't unpublish if there are student submissions",
        502,
      ),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Unpublish" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Unpublish" }));

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("Canvas refused to unpublish this assignment");
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
