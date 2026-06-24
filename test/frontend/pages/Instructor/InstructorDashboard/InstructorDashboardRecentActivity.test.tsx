import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { getInstitutionData } from "@/data/institutionCourseData";
import { InstructorDashboardRecentActivity } from "@/pages/Instructor/InstructorDashboard/InstructorDashboardRecentActivity";
import { paths } from "@/routes/paths";
import { renderWithRouter } from "@test/utils/renderWithRouter";

describe("InstructorDashboardRecentActivity", () => {
  it("renders recent activity items and view-all link", () => {
    renderWithRouter(
      <InstructorDashboardRecentActivity
        activities={getInstitutionData("ubc")!.dashboard.recentActivity}
      />,
    );

    expect(screen.getByText("Recent Activity")).toBeInTheDocument();
    expect(screen.getByText("Assignment created")).toBeInTheDocument();
    expect(
      screen.getAllByText("CS 101: Intro to Programming").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("Grades updated")).toBeInTheDocument();
    expect(screen.getByText("Announcement posted")).toBeInTheDocument();
    expect(screen.getByText("Student message received")).toBeInTheDocument();

    const viewAllLink = screen.getByRole("link", { name: "View All Activity" });
    expect(viewAllLink).toHaveAttribute("href", paths.instructor.history);
  });
});
