import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { getInstitutionData } from "@/data/institutionCourseData";
import { InstructorDashboardNotifications } from "@/pages/Instructor/InstructorDashboard/InstructorDashboardNotifications";
import { paths } from "@/routes/paths";
import { renderWithRouter } from "@test/utils/renderWithRouter";

describe("InstructorDashboardNotifications", () => {
  it("renders notifications with badge count and view-all link", () => {
    renderWithRouter(
      <InstructorDashboardNotifications
        notifications={getInstitutionData("ubc")!.dashboard.notifications}
      />,
    );

    expect(screen.getByText("Notifications")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(
      screen.getByText("12 submissions pending review"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("AI workflow completed successfully"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("New student enrolled in CS 101"),
    ).toBeInTheDocument();
    const viewAllLink = screen.getByRole("link", {
      name: "View All Notifications",
    });
    expect(viewAllLink).toHaveAttribute("href", paths.instructor.notifications);
  });
});
