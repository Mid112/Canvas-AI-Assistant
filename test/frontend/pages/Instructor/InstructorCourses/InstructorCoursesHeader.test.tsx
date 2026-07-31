import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InstructorCoursesHeader } from "@/pages/Instructor/InstructorCourses/InstructorCoursesHeader";
import { renderWithInstitution } from "@test/utils/renderWithInstitution";

const CANVAS_URL = "https://canvas.example.edu";

const mockUseCanvasConnectionUrl = vi.fn(() => CANVAS_URL);
const mockUseAuth = vi.fn();
const mockCreateCourse = vi.fn();

vi.mock("@/hooks/useCanvasConnectionUrl", () => ({
  useCanvasConnectionUrl: () => mockUseCanvasConnectionUrl(),
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

vi.mock("@/services/canvas", async () => {
  const actual = await vi.importActual<typeof import("@/services/canvas")>(
    "@/services/canvas",
  );
  return {
    ...actual,
    createCourse: (...args: unknown[]) => mockCreateCourse(...args),
  };
});

beforeEach(() => {
  mockCreateCourse.mockReset();
  mockUseAuth.mockReturnValue({
    accessToken: "tok",
    user: {
      id: 1,
      has_canvas_token: true,
      canvas_connections: [{ id: 1, canvas_url: CANVAS_URL, created_at: "" }],
    },
  });
  mockUseCanvasConnectionUrl.mockReturnValue(CANVAS_URL);
});

describe("InstructorCoursesHeader", () => {
  // Verifies: Renders the course management heading and institution context.
  it("renders the course management heading and institution context", () => {
    renderWithInstitution(<InstructorCoursesHeader />);

    expect(
      screen.getByRole("heading", { name: "Course Management" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Manage all your courses and track performance at canvas\.ubc\.ca\./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "New Course" }),
    ).toBeInTheDocument();
  });

  // Verifies: Hides New Course when Canvas is not connected.
  it("hides New Course when Canvas is not connected", () => {
    mockUseAuth.mockReturnValue({
      accessToken: null,
      user: {
        id: 1,
        has_canvas_token: false,
        canvas_connections: [],
      },
    });

    renderWithInstitution(<InstructorCoursesHeader />);

    expect(
      screen.queryByRole("button", { name: "New Course" }),
    ).not.toBeInTheDocument();
  });

  // Verifies: Opens an in-app create dialog and creates a course (#1285).
  it("opens an in-app create dialog and creates a course", async () => {
    const user = userEvent.setup();
    const onRefreshCourses = vi.fn();
    mockCreateCourse.mockResolvedValue({
      canvas_id: 9,
      local_id: 1,
      name: "COSC 499",
      course_code: "COSC499",
      workflow_state: "unpublished",
      total_students: null,
      term_name: null,
    });

    renderWithInstitution(
      <InstructorCoursesHeader onRefreshCourses={onRefreshCourses} />,
    );

    await user.click(screen.getByRole("button", { name: "New Course" }));
    expect(
      screen.getByRole("heading", { name: "Create course" }),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText("Course name"), "COSC 499");
    await user.type(screen.getByLabelText("Course code (optional)"), "COSC499");
    await user.click(screen.getByRole("button", { name: "Create course" }));

    expect(mockCreateCourse).toHaveBeenCalledWith(
      {
        name: "COSC 499",
        course_code: "COSC499",
        publish: false,
      },
      "tok",
      CANVAS_URL,
    );
    expect(onRefreshCourses).toHaveBeenCalledTimes(1);
  });

  // Verifies: Renders a sync button when refresh is available.
  it("renders a sync button when refresh is available", () => {
    renderWithInstitution(
      <InstructorCoursesHeader onRefreshCourses={() => undefined} />,
    );

    expect(
      screen.getByRole("button", { name: "Sync from Canvas" }),
    ).toBeInTheDocument();
  });

  // Verifies: Calls onRefreshCourses when sync is clicked.
  it("calls onRefreshCourses when sync is clicked", async () => {
    const user = userEvent.setup();
    const onRefreshCourses = vi.fn();

    renderWithInstitution(
      <InstructorCoursesHeader onRefreshCourses={onRefreshCourses} />,
    );

    await user.click(screen.getByRole("button", { name: "Sync from Canvas" }));

    expect(onRefreshCourses).toHaveBeenCalledTimes(1);
  });
});
