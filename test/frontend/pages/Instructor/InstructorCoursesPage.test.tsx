import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { useInstitution } from "@/contexts/useInstitution";
import { InstructorCoursesPage } from "@/pages/Instructor/InstructorCoursesPage";
import { renderWithInstitution } from "@test/utils/renderWithInstitution";

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
});
