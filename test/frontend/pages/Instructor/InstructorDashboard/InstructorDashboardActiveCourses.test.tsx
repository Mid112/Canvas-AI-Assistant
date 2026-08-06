// Test note: covers the instructor dashboard active courses.test behavior so future changes can preserve the expected Canvas workflow contract.

import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { InstructorDashboardActiveCourses } from "@/pages/Instructor/InstructorDashboard/InstructorDashboardActiveCourses";
import type { InstructorCourse } from "@/types/course";
import { renderWithRouter } from "@test/utils/renderWithRouter";

const courses: InstructorCourse[] = [
  {
    id: 1,
    code: "CS 101",
    name: "Intro to Programming",
    progress: 0,
    studentCount: 45,
    assignmentCount: 8,
    lastActivity: "Synced from Canvas",
  },
  {
    id: 2,
    code: "CS 401",
    name: "Advanced Topics",
    progress: 0,
    studentCount: 22,
    assignmentCount: 4,
    lastActivity: "Synced from Canvas",
  },
];

describe("InstructorDashboardActiveCourses", () => {
  // Verifies: Renders active courses with assignment links.
  it("renders active courses with assignment links", () => {
    renderWithRouter(<InstructorDashboardActiveCourses courses={courses} />);

    expect(screen.getAllByText("Active Courses").length).toBeGreaterThan(0);
    expect(screen.getByText("CS 101: Intro to Programming")).toBeInTheDocument();
    expect(screen.getByText("45 students · 8 assignments")).toBeInTheDocument();
    expect(screen.getByText("CS 401: Advanced Topics")).toBeInTheDocument();

    expect(screen.getAllByRole("link", { name: "View" })[0]).toHaveAttribute(
      "href",
      "/instructor/courses/1",
    );
    expect(screen.getAllByRole("link", { name: "View" })[1]).toHaveAttribute(
      "href",
      "/instructor/courses/2",
    );
  });

  // Verifies: Renders an empty state when there are no courses.
  it("renders an empty state when there are no courses", () => {
    renderWithRouter(<InstructorDashboardActiveCourses courses={[]} />);

    expect(
      screen.getByText("No Canvas courses to display yet."),
    ).toBeInTheDocument();
  });
});
