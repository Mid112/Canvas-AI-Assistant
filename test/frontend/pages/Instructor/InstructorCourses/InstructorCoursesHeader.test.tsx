import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InstructorCoursesHeader } from "@/pages/Instructor/InstructorCourses/InstructorCoursesHeader";
import { renderWithInstitution } from "@test/utils/renderWithInstitution";

const CANVAS_URL = "https://canvas.ubc.ca";

const mockUseCanvasConnectionUrl = vi.fn(() => CANVAS_URL);
const mockUseAuth = vi.fn();

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

beforeEach(() => {
  mockUseAuth.mockReturnValue({
    user: {
      id: 1,
      has_canvas_token: true,
      canvas_connections: [{ id: 1, canvas_url: CANVAS_URL, created_at: "" }],
    },
  });
});

describe("InstructorCoursesHeader", () => {
  it("renders the course management heading and institution context", () => {
    mockUseCanvasConnectionUrl.mockReturnValue(CANVAS_URL);

    renderWithInstitution(<InstructorCoursesHeader />);

    expect(
      screen.getByRole("heading", { name: "Course Management" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Manage all your courses and track performance at UBC\./),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "New Course" }),
    ).toHaveAttribute("href", `${CANVAS_URL}/courses`);
  });

  it("hides New Course when Canvas is not connected", () => {
    vi.stubEnv("VITE_CANVAS_UBC_URL", CANVAS_URL);
    mockUseCanvasConnectionUrl.mockReturnValue(undefined);
    mockUseAuth.mockReturnValue({
      user: {
        id: 1,
        has_canvas_token: false,
        canvas_connections: [],
      },
    });

    renderWithInstitution(<InstructorCoursesHeader />);

    expect(screen.queryByRole("link", { name: "New Course" })).not.toBeInTheDocument();

    vi.unstubAllEnvs();
  });

  it("strips a trailing slash from the Canvas host before building the new course URL", () => {
    mockUseCanvasConnectionUrl.mockReturnValue(`${CANVAS_URL}/`);

    renderWithInstitution(<InstructorCoursesHeader />);

    expect(
      screen.getByRole("link", { name: "New Course" }),
    ).toHaveAttribute("href", `${CANVAS_URL}/courses`);
  });

  it("renders a sync button when refresh is available", () => {
    renderWithInstitution(
      <InstructorCoursesHeader onRefreshCourses={() => undefined} />,
    );

    expect(
      screen.getByRole("button", { name: "Sync from Canvas" }),
    ).toBeInTheDocument();
  });

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
