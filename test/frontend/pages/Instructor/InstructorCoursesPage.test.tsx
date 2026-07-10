import type { ComponentProps } from "react";
import type React from "react";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useInstitution } from "@/contexts/useInstitution";
import { InstructorCoursesPage } from "@/pages/Instructor/InstructorCoursesPage";
import { fetchCourseAssignments } from "@/services/assignments";
import { fetchActiveCourse, fetchCourses, setActiveCourse } from "@/services/canvas";
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

const instructorCoursesSectionMock = vi.hoisted(() => vi.fn());
const instructorCoursesSectionState = vi.hoisted(() => ({
  ActualSection: null as React.ComponentType<Record<string, unknown>> | null,
}));

vi.mock("@/pages/Instructor/InstructorCourses/InstructorCoursesSection", async () => {
  const actual = await vi.importActual<
    typeof import("@/pages/Instructor/InstructorCourses/InstructorCoursesSection")
  >("@/pages/Instructor/InstructorCourses/InstructorCoursesSection");

  instructorCoursesSectionState.ActualSection = actual.InstructorCoursesSection;

  return {
    ...actual,
    InstructorCoursesSection: (
      props: ComponentProps<typeof actual.InstructorCoursesSection>,
    ) => instructorCoursesSectionMock(props),
  };
});

const mockUseAuth = vi.fn();
const mockedFetchCourses = vi.mocked(fetchCourses);
const mockedFetchActiveCourse = vi.mocked(fetchActiveCourse);
const mockedSetActiveCourse = vi.mocked(setActiveCourse);
const mockedFetchCourseAssignments = vi.mocked(fetchCourseAssignments);

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
const LOCAL_CANVAS_URL = "http://localhost:3000";

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
  {
    canvas_id: 102,
    local_id: 2,
    name: "Data Structures",
    course_code: "CS 201",
    workflow_state: "available",
    total_students: 38,
  },
  {
    canvas_id: 103,
    local_id: 3,
    name: "Database Systems",
    course_code: "CS 250",
    workflow_state: "available",
    total_students: 52,
  },
];

function InstitutionSwitchHarness() {
  const { setSelectedInstitution } = useInstitution();

  return (
    <>
      <button type="button" onClick={() => setSelectedInstitution("ubco")}>
        Switch to UBCO
      </button>
      <InstructorCoursesPage />
    </>
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  const ActualSection = instructorCoursesSectionState.ActualSection!;
  instructorCoursesSectionMock.mockImplementation((props) => (
    <ActualSection {...props} />
  ));
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
  mockedFetchCourseAssignments.mockResolvedValue([
    { id: 1, name: "Assignment 1", course_id: 101 },
  ]);
});

describe("InstructorCoursesPage", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Verifies: Shows only the connect gate when Canvas is not connected.
  it("shows only the connect gate when Canvas is not connected", () => {
    mockUseAuth.mockReturnValue(authWithoutCanvas);

    renderWithInstitution(<InstructorCoursesPage />);

    expect(
      screen.getByRole("heading", { name: "Course Management" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Connect Canvas to continue")).toBeInTheDocument();
    expect(screen.queryByText("Course Analytics Overview")).not.toBeInTheDocument();
    expect(screen.queryByText("Your Courses (6)")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Courses coming soon"),
    ).not.toBeInTheDocument();
  });

  // Verifies: Loads courses from local Canvas Docker without VITE_CANVAS_UBC_URL.
  it("loads courses from local Canvas Docker without VITE_CANVAS_UBC_URL", async () => {
    mockUseAuth.mockReturnValue({
      ...authWithCanvas,
      user: {
        ...authWithCanvas.user,
        canvas_connections: [
          {
            id: 1,
            canvas_url: LOCAL_CANVAS_URL,
            created_at: "2026-06-26T00:00:00.000Z",
          },
        ],
      },
    });

    renderWithInstitution(<InstructorCoursesPage />);

    await waitFor(() => {
      expect(mockedFetchCourses).toHaveBeenCalledWith("token", LOCAL_CANVAS_URL);
    });

    expect(await screen.findByText("Your Courses (3)")).toBeInTheDocument();
    expect(screen.queryByText("Connect Canvas to continue")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New Course" })).toHaveAttribute(
      "href",
      `${LOCAL_CANVAS_URL}/courses`,
    );
  });

  // Verifies: Hides New Course on connect state when env is unset and no saved connection.
  it("hides New Course on connect state when env is unset and no saved connection", () => {
    mockUseAuth.mockReturnValue(authWithoutCanvas);

    renderWithInstitution(<InstructorCoursesPage />);

    expect(screen.getByText("Connect Canvas to continue")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "New Course" })).not.toBeInTheDocument();
  });

  // Verifies: Hides New Course on connect state when no saved connection exists.
  it("hides New Course on connect state when no saved connection exists", () => {
    vi.stubEnv("VITE_CANVAS_UBC_URL", CANVAS_URL);
    mockUseAuth.mockReturnValue(authWithoutCanvas);

    renderWithInstitution(<InstructorCoursesPage />);

    expect(screen.getByText("Connect Canvas to continue")).toBeInTheDocument();
    expect(screen.queryByText("Course Analytics Overview")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Search courses")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "New Course" })).not.toBeInTheDocument();

    vi.unstubAllEnvs();
  });

  // Verifies: Shows connect Canvas when no token exists for the saved connection URL.
  it("shows connect Canvas when no token exists for the saved connection URL", async () => {
    const { CanvasApiError } = await import("@/services/canvas");
    mockedFetchCourses.mockRejectedValue(
      new CanvasApiError(
        "No Canvas token for https://canvas.ubc.ca. PATCH to /api/v1/auth/me/canvas-token first.",
        403,
      ),
    );

    renderWithInstitution(<InstructorCoursesPage />);

    expect(
      await screen.findByText("Connect Canvas to continue"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/PATCH to \/api\/v1/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Search courses")).not.toBeInTheDocument();
  });

  // Verifies: Loads Canvas courses with the saved connection URL.
  it("loads Canvas courses with the saved connection URL", async () => {
    renderWithInstitution(<InstructorCoursesPage />);

    await waitFor(() => {
      expect(mockedFetchCourses).toHaveBeenCalledWith("token", CANVAS_URL);
    });

    expect(await screen.findByText("Your Courses (3)")).toBeInTheDocument();
    expect(
      screen.getByText("CS 101: Introduction to Programming"),
    ).toBeInTheDocument();
    expect(screen.getByText("Course Analytics Overview")).toBeInTheDocument();
  });

  // Verifies: Shows a Canvas loading state while courses load.
  it("shows a Canvas loading state while courses load", () => {
    mockedFetchCourses.mockReturnValue(
      new Promise<typeof canvasCourses>(() => undefined),
    );

    renderWithInstitution(<InstructorCoursesPage />);

    expect(
      screen.getByText("Loading courses from Canvas..."),
    ).toBeInTheDocument();
  });

  // Verifies: Filters courses by search query.
  it("filters courses by search query", async () => {
    const user = userEvent.setup();

    renderWithInstitution(<InstructorCoursesPage />);
    await screen.findByText("Your Courses (3)");

    await user.type(screen.getByLabelText("Search courses"), "Database");

    expect(screen.getByText("Your Courses (1)")).toBeInTheDocument();
    expect(
      screen.getByText("CS 250: Database Systems"),
    ).toBeInTheDocument();
  });

  // Verifies: Shows the empty state when no courses match the search.
  it("shows the empty state when no courses match the search", async () => {
    const user = userEvent.setup();

    renderWithInstitution(<InstructorCoursesPage />);
    await screen.findByText("Your Courses (3)");

    await user.type(
      screen.getByLabelText("Search courses"),
      "nonexistent course",
    );

    expect(screen.getByText("No courses found")).toBeInTheDocument();
    expect(
      screen.getByText("No Canvas courses matched this search."),
    ).toBeInTheDocument();
  });

  // Verifies: Switches to list view when requested.
  it("switches to list view when requested", async () => {
    const user = userEvent.setup();

    renderWithInstitution(<InstructorCoursesPage />);
    await screen.findByText("Your Courses (3)");

    await user.click(screen.getByRole("button", { name: "List View" }));

    expect(
      await screen.findByText(/45 students · 1 assignments/),
    ).toBeInTheDocument();
  });

  // Verifies: Reloads courses when sync from Canvas is clicked.
  it("reloads courses when sync from Canvas is clicked", async () => {
    const user = userEvent.setup();

    renderWithInstitution(<InstructorCoursesPage />);
    await screen.findByText("Your Courses (3)");

    mockedFetchCourses.mockClear();

    await user.click(screen.getByRole("button", { name: "Sync from Canvas" }));

    await waitFor(() => {
      expect(mockedFetchCourses).toHaveBeenCalledWith("token", CANVAS_URL);
    });
  });

  // Verifies: Shows a Canvas empty state when Canvas returns no courses.
  it("shows a Canvas empty state when Canvas returns no courses", async () => {
    mockedFetchCourses.mockResolvedValue([]);

    renderWithInstitution(<InstructorCoursesPage />);

    await waitFor(() => {
      expect(
        screen.getByText(/No courses found in Canvas/i),
      ).toBeInTheDocument();
    });
  });

  // Verifies: Shows a Canvas error without mock courses.
  it("shows a Canvas error without mock courses", async () => {
    const { CanvasApiError } = await import("@/services/canvas");
    mockedFetchCourses.mockRejectedValue(
      new CanvasApiError("Canvas unavailable", 503),
    );

    renderWithInstitution(<InstructorCoursesPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Canvas unavailable").length).toBeGreaterThan(0);
    });

    expect(
      screen.queryByText("CS 101: Introduction to Programming"),
    ).not.toBeInTheDocument();
  });

  // Verifies: Shows Canvas-derived overview metrics from synced courses.
  it("shows Canvas-derived overview metrics from synced courses", async () => {
    renderWithInstitution(<InstructorCoursesPage />);
    await screen.findByText("Your Courses (3)");

    expect(screen.getByText("Total Students")).toBeInTheDocument();
    expect(screen.getByText("135")).toBeInTheDocument();
  });

  // Verifies: Persists the selected active course locally.
  it("persists the selected active course locally", async () => {
    const user = userEvent.setup();

    renderWithInstitution(<InstructorCoursesPage />);

    await screen.findByText("Your Courses (3)");
    await user.click(screen.getAllByRole("button", { name: "Set Active" })[0]!);

    await waitFor(() => {
      expect(mockedSetActiveCourse).toHaveBeenCalledWith(1, "token");
      expect(document.body.textContent).toContain(
        "Active course: CS 101: Introduction to Programming",
      );
    });
  });

  // Verifies: Shows immediate feedback while saving the active course.
  it("shows immediate feedback while saving the active course", async () => {
    const user = userEvent.setup();
    let resolveSave: ((value: Awaited<ReturnType<typeof setActiveCourse>>) => void) | undefined;
    mockedSetActiveCourse.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );

    renderWithInstitution(<InstructorCoursesPage />);

    await screen.findByText("Your Courses (3)");
    await user.click(screen.getAllByRole("button", { name: "Set Active" })[0]!);

    expect(
      screen.getByRole("button", { name: "Setting active..." }),
    ).toBeDisabled();

    resolveSave?.({
      local_id: 1,
      canvas_course_id: "101",
      canvas_url: CANVAS_URL,
      name: "Introduction to Programming",
      term: null,
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Active Course" })).toBeDisabled();
    });
  });

  // Verifies: Ignores setting active when the course no longer exists.
  it("ignores setting active when the course no longer exists", async () => {
    const user = userEvent.setup();

    instructorCoursesSectionMock.mockImplementation(({ onSetActiveCourse }) => (
      <button type="button" onClick={() => onSetActiveCourse(999)}>
        Trigger missing course
      </button>
    ));

    renderWithInstitution(<InstructorCoursesPage />);

    await user.click(
      await screen.findByRole("button", { name: "Trigger missing course" }),
    );

    expect(mockedSetActiveCourse).not.toHaveBeenCalled();
  });
});
