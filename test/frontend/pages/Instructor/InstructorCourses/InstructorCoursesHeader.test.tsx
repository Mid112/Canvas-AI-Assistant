import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { InstructorCoursesHeader } from "@/pages/Instructor/InstructorCourses/InstructorCoursesHeader";
import { renderWithInstitution } from "@test/utils/renderWithInstitution";

const CANVAS_URL = "https://canvas.ubc.ca";

const mockUseCanvasConnectionUrl = vi.fn(() => CANVAS_URL);

vi.mock("@/hooks/useCanvasConnectionUrl", () => ({
  useCanvasConnectionUrl: () => mockUseCanvasConnectionUrl(),
}));

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

  it("falls back to the configured institution Canvas URL when not connected", () => {
    vi.stubEnv("VITE_CANVAS_UBC_URL", CANVAS_URL);
    mockUseCanvasConnectionUrl.mockReturnValue(undefined);

    renderWithInstitution(<InstructorCoursesHeader />);

    expect(
      screen.getByRole("link", { name: "New Course" }),
    ).toHaveAttribute("href", `${CANVAS_URL}/courses`);

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
