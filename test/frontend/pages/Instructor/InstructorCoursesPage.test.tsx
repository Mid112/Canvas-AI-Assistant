import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useInstitution } from "@/contexts/useInstitution";
import { InstructorCoursesPage } from "@/pages/Instructor/InstructorCoursesPage";
import { fetchCourseAssignments } from "@/services/assignments";
import { fetchCourses } from "@/services/canvas";
import { renderWithInstitution } from "@test/utils/renderWithInstitution";

vi.mock("@/services/canvas", () => ({
  CanvasApiError: class CanvasApiError extends Error {
    status = 500;
  },
  fetchCourses: vi.fn(),
}));

vi.mock("@/services/assignments", () => ({
  AssignmentApiError: class AssignmentApiError extends Error {
    status = 500;
  },
  fetchCourseAssignments: vi.fn(),
}));

const mockUseAuth = vi.fn();
const mockedFetchCourses = vi.mocked(fetchCourses);
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
  refreshUser: vi.fn(),
};

const authWithoutCanvas = {
  ...authWithCanvas,
  user: { ...authWithCanvas.user, has_canvas_token: false },
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
  mockUseAuth.mockReturnValue(authWithCanvas);
  mockedFetchCourses.mockResolvedValue(canvasCourses);
  mockedFetchCourseAssignments.mockResolvedValue([
    { id: 1, name: "Assignment 1", course_id: 101 },
  ]);
});

describe("InstructorCoursesPage", () => {
  it("requires Canvas before showing courses", () => {
    mockUseAuth.mockReturnValue(authWithoutCanvas);

    renderWithInstitution(<InstructorCoursesPage />);

    expect(screen.getByText("Connect Canvas to continue")).toBeInTheDocument();
    expect(screen.queryByLabelText("Search courses")).not.toBeInTheDocument();
    expect(screen.queryByText("Course Analytics Overview")).not.toBeInTheDocument();
  });

  it("renders Canvas courses after they load", async () => {
    renderWithInstitution(<InstructorCoursesPage />);

    expect(await screen.findByText("Your Courses (3)")).toBeInTheDocument();
    expect(
      screen.getByText("CS 101: Introduction to Programming"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Course Analytics Overview")).not.toBeInTheDocument();
  });

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

  it("shows the empty state when no courses match the search", async () => {
    const user = userEvent.setup();

    renderWithInstitution(<InstructorCoursesPage />);
    await screen.findByText("Your Courses (3)");

    await user.type(
      screen.getByLabelText("Search courses"),
      "nonexistent course",
    );

    expect(screen.getByText("No courses found")).toBeInTheDocument();
  });

  it("switches to list view when requested", async () => {
    const user = userEvent.setup();

    renderWithInstitution(<InstructorCoursesPage />);
    await screen.findByText("Your Courses (3)");

    await user.click(screen.getByRole("button", { name: "List View" }));

    expect(screen.getByText(/45 students · 1 assignments/)).toBeInTheDocument();
  });

  it("reloads courses when sync from Canvas is clicked", async () => {
    const user = userEvent.setup();

    renderWithInstitution(<InstructorCoursesPage />);
    await screen.findByText("Your Courses (3)");

    mockedFetchCourses.mockClear();

    await user.click(screen.getByRole("button", { name: "Sync from Canvas" }));

    await waitFor(() => {
      expect(mockedFetchCourses).toHaveBeenCalled();
    });
  });

  it("reloads courses when the institution changes", async () => {
    const user = userEvent.setup();

    renderWithInstitution(<InstitutionSwitchHarness />);
    await screen.findByText("Your Courses (3)");

    mockedFetchCourses.mockClear();
    mockedFetchCourses.mockResolvedValue([
      {
        canvas_id: 201,
        local_id: 10,
        name: "Computer Programming I",
        course_code: "COSC 111",
        workflow_state: "available",
        total_students: 30,
      },
    ]);

    await user.click(screen.getByRole("button", { name: "Switch to UBCO" }));

    await waitFor(() => {
      expect(mockedFetchCourses).toHaveBeenCalled();
    });

    expect(
      await screen.findByText("COSC 111: Computer Programming I"),
    ).toBeInTheDocument();
  });

  it("shows a Canvas empty state when Canvas returns no courses", async () => {
    mockedFetchCourses.mockResolvedValue([]);

    renderWithInstitution(<InstructorCoursesPage />);

    await waitFor(() => {
      expect(
        screen.getByText(/No courses found in Canvas/i),
      ).toBeInTheDocument();
    });
  });

  it("shows a Canvas error without mock courses", async () => {
    const { CanvasApiError } = await import("@/services/canvas");
    mockedFetchCourses.mockRejectedValue(
      new CanvasApiError("Canvas unavailable", 503),
    );

    renderWithInstitution(<InstructorCoursesPage />);

    await waitFor(() => {
      expect(screen.getByText("Canvas unavailable")).toBeInTheDocument();
    });

    expect(
      screen.queryByText("CS 101: Introduction to Programming"),
    ).not.toBeInTheDocument();
  });
});
