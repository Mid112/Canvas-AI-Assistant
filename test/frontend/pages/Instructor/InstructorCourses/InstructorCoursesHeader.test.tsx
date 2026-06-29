import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { InstructorCoursesHeader } from "@/pages/Instructor/InstructorCourses/InstructorCoursesHeader";
import { renderWithInstitution } from "@test/utils/renderWithInstitution";

const CANVAS_URL = "https://canvas.ubc.ca";

describe("InstructorCoursesHeader", () => {
  it("renders the course management heading and institution context", () => {
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
