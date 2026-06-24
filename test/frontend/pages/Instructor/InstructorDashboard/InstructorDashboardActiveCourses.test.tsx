import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { getInstitutionData } from "@/data/institutionCourseData";
import { InstructorDashboardActiveCourses } from "@/pages/Instructor/InstructorDashboard/InstructorDashboardActiveCourses";
import { paths } from "@/routes/paths";
import { renderWithRouter } from "@test/utils/renderWithRouter";

describe("InstructorDashboardActiveCourses", () => {
  it("renders active courses with view links", () => {
    renderWithRouter(
      <InstructorDashboardActiveCourses
        courses={getInstitutionData("ubc")!.dashboard.activeCourses}
      />,
    );

    expect(screen.getAllByText("Active Courses").length).toBeGreaterThan(0);
    expect(
      screen.getByText("CS 101: Intro to Programming"),
    ).toBeInTheDocument();
    expect(screen.getByText("45 students · 8 assignments")).toBeInTheDocument();
    expect(
      screen.getByText("CS 401: Advanced Topics"),
    ).toBeInTheDocument();

    const viewLinks = screen.getAllByRole("link", { name: "View" });
    expect(viewLinks).toHaveLength(6);
    viewLinks.forEach((link) => {
      expect(link).toHaveAttribute("href", paths.instructor.courses);
    });
  });
});
