import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { getInstitutionData } from "@/data/institutionCourseData";
import { InstructorDashboardNotifications } from "@/pages/Instructor/InstructorDashboard/InstructorDashboardNotifications";

describe("InstructorDashboardNotifications", () => {
  it("renders notifications with badge count", () => {
    render(
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
    expect(
      screen.getByRole("button", { name: "View All Notifications" }),
    ).toBeInTheDocument();
  });
});
