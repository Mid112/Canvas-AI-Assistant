import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { InstructorCoursesHeader } from "@/pages/Instructor/InstructorCourses/InstructorCoursesHeader";
import { renderWithInstitution } from "@test/utils/renderWithInstitution";

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
      screen.getByRole("button", { name: "New Course" }),
    ).toBeInTheDocument();
  });
});
