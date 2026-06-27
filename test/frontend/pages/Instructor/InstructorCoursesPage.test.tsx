import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAuth } from "@/contexts/AuthContext";
import { useInstitution } from "@/contexts/useInstitution";
import { InstructorCoursesPage } from "@/pages/Instructor/InstructorCoursesPage";
import { fetchCourses } from "@/services/canvas";
import { renderWithInstitution } from "@test/utils/renderWithInstitution";

vi.mock("@/contexts/AuthContext", async () => {
  const actual = await vi.importActual<typeof import("@/contexts/AuthContext")>(
    "@/contexts/AuthContext",
  );

  return {
    ...actual,
    useAuth: vi.fn(),
  };
});

vi.mock("@/services/canvas", () => ({
  CanvasApiError: class CanvasApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  fetchCourses: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);
const mockedFetchCourses = vi.mocked(fetchCourses);

const authWithoutCanvas = {
  user: {
    id: 1,
    email: "instructor@example.com",
    name: "Dr. Jane Doe",
    role: "instructor" as const,
    is_active: true,
    has_canvas_token: false,
    canvas_connections: [],
  },
  accessToken: "token",
  isAuthenticated: true,
  isLoading: false,
  login: vi.fn(),
  register: vi.fn(),
  refreshUser: vi.fn(),
  logout: vi.fn(),
};

const authWithCanvas = {
  ...authWithoutCanvas,
  user: {
    ...authWithoutCanvas.user,
    has_canvas_token: true,
    // Mirrors the saved Canvas Docker URL that should be threaded into
    // Canvas-backed service calls instead of relying on backend defaults.
    canvas_connections: [
      {
        id: 1,
        canvas_url: "http://localhost:3000",
        created_at: "2026-06-26T00:00:00.000Z",
      },
    ],
  },
};

const canvasCourse = {
  canvas_id: 101,
  local_id: 7,
  name: "Canvas Operating Systems",
  course_code: "CS 330",
  workflow_state: "available",
  total_students: 32,
};

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

describe("InstructorCoursesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseAuth.mockReturnValue(authWithoutCanvas);
    mockedFetchCourses.mockResolvedValue([canvasCourse]);
  });

  it("renders the course management page instead of the placeholder", () => {
    renderWithInstitution(<InstructorCoursesPage />);

    expect(
      screen.getByRole("heading", { name: "Course Management" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Course Analytics Overview")).toBeInTheDocument();
    expect(screen.getByText("Your Courses (6)")).toBeInTheDocument();
    expect(
      screen.queryByText("Courses coming soon"),
    ).not.toBeInTheDocument();
  });

  it("filters courses by search query", async () => {
    const user = userEvent.setup();

    renderWithInstitution(<InstructorCoursesPage />);

    await user.type(screen.getByLabelText("Search courses"), "Database");

    expect(screen.getByText("Your Courses (1)")).toBeInTheDocument();
    expect(
      screen.getByText("CS 250: Database Systems"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("CS 101: Introduction to Programming"),
    ).not.toBeInTheDocument();
  });

  it("shows the empty state when no courses match", async () => {
    const user = userEvent.setup();

    renderWithInstitution(<InstructorCoursesPage />);

    await user.type(
      screen.getByLabelText("Search courses"),
      "nonexistent course",
    );

    expect(screen.getByText("No courses found")).toBeInTheDocument();
    expect(
      screen.queryByText("CS 101: Introduction to Programming"),
    ).not.toBeInTheDocument();
  });

  it("switches to list view when requested", async () => {
    const user = userEvent.setup();

    renderWithInstitution(<InstructorCoursesPage />);

    await user.click(screen.getByRole("button", { name: "List View" }));

    expect(
      screen.getByText(/45 students · 8 assignments/),
    ).toBeInTheDocument();
  });

  it("updates courses and analytics when the institution changes", async () => {
    const user = userEvent.setup();

    renderWithInstitution(<InstitutionSwitchHarness />);

    expect(screen.getByText("Your Courses (6)")).toBeInTheDocument();
    expect(screen.getByText("78%")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Switch to UBCO" }));

    expect(screen.getByText("Your Courses (3)")).toBeInTheDocument();
    expect(screen.getByText("72%")).toBeInTheDocument();
    expect(
      screen.getByText("COSC 111: Computer Programming I"),
    ).toBeInTheDocument();
  });

  it("loads Canvas courses with the saved connection URL when connected", async () => {
    mockedUseAuth.mockReturnValue(authWithCanvas);

    renderWithInstitution(<InstructorCoursesPage />);

    await waitFor(() => {
      expect(mockedFetchCourses).toHaveBeenCalledWith(
        "token",
        "http://localhost:3000",
      );
    });

    expect(
      await screen.findByText("CS 330: Canvas Operating Systems"),
    ).toBeInTheDocument();
  });

  it("does not show mock institution courses when Canvas is connected", async () => {
    mockedUseAuth.mockReturnValue(authWithCanvas);

    renderWithInstitution(<InstructorCoursesPage />);

    // Once connected, Canvas is the source of truth; mock institution courses
    // must stay hidden even though they are still available in InstitutionContext.
    expect(
      await screen.findByText("CS 330: Canvas Operating Systems"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("CS 101: Introduction to Programming"),
    ).not.toBeInTheDocument();
  });

  it("shows a Canvas loading state while courses load", () => {
    mockedUseAuth.mockReturnValue(authWithCanvas);
    mockedFetchCourses.mockReturnValue(
      new Promise<typeof canvasCourse[]>(() => undefined),
    );

    renderWithInstitution(<InstructorCoursesPage />);

    expect(
      screen.getByText("Loading courses from Canvas..."),
    ).toBeInTheDocument();
  });

  it("shows the Canvas empty state when no connected courses match", async () => {
    const user = userEvent.setup();
    mockedUseAuth.mockReturnValue(authWithCanvas);
    mockedFetchCourses.mockResolvedValue([canvasCourse]);

    renderWithInstitution(<InstructorCoursesPage />);

    expect(
      await screen.findByText("CS 330: Canvas Operating Systems"),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText("Search courses"), "nonexistent");

    expect(screen.getByText("No courses found")).toBeInTheDocument();
    expect(
      screen.getByText("No Canvas courses matched this search."),
    ).toBeInTheDocument();
  });

  it("shows a Canvas fetch error and does not fall back to mock courses", async () => {
    const { CanvasApiError } = await import("@/services/canvas");
    mockedUseAuth.mockReturnValue(authWithCanvas);
    mockedFetchCourses.mockRejectedValue(
      new CanvasApiError("Canvas is unavailable.", 503),
    );

    renderWithInstitution(<InstructorCoursesPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Canvas is unavailable.",
    );
    expect(
      screen.queryByText("CS 101: Introduction to Programming"),
    ).not.toBeInTheDocument();
  });
});
